import { writeFileSync } from "node:fs";
import {
  createGame,
  buy,
  sell,
  roll,
  buyXp,
  startRound,
  settle,
  nextRound,
} from "../src/engine/game";
import { prepareBot, deployLineup } from "../src/engine/ai";
import { equipBot, claimReward, itemScore } from "../src/engine/equipment";
import { simulateOutcome } from "../src/engine/battle";
import { validGame } from "../src/engine/persistence";
import { UNIT, RULES } from "../src/data/units";
const rows = [];
for (const seed of [137, 307, 809, 1619]) {
  const g = createGame(seed);
  while (g.phase !== "finished") {
    const p = g.players[0];
    p.id = 2;
    try {
      prepareBot(g, p, { buy, sell, roll, buyXp });
    } finally {
      p.id = 0;
    }
    const result = startRound(g)!;
    if (result.kind === "pve") {
      const variants = [
        { name: "原布阵", pieces: structuredClone(result.left) },
      ];
      for (const formation of ["spread", "compact"] as const) {
        const preview = structuredClone(p),
          context = { ...g, phase: "prepare" as const };
        deployLineup(preview, "standard", formation);
        equipBot(context, preview);
        variants.push({
          name: formation,
          pieces: preview.pieces.filter((p) => p.position !== null),
        });
        variants.push({
          name: formation + "-mirror",
          pieces: preview.pieces
            .filter((p) => p.position !== null)
            .map((p) => ({
              ...p,
              position: Math.floor(p.position! / 8) * 8 + 7 - (p.position! % 8),
            })),
        });
      }
      const scores = variants.map((v) => {
        const outcome = simulateOutcome(
          v.pieces,
          result.right,
          g.combatVersion,
        );
        return {
          name: v.name,
          winner: outcome.winner,
          seconds: outcome.final.tick * 0.25,
          pieces: v.pieces,
        };
      });
      rows.push({
        seed,
        round: g.round,
        level: p.level,
        gold: p.gold,
        hp: p.hp,
        budget: result.left.reduce(
          (n, p) => n + UNIT[p.defId].cost * 3 ** (p.star - 1),
          0,
        ),
        enemy: result.right,
        scores,
      });
    }
    settle(g, result);
    if (g.reward) {
      const best = g.reward.choices
        .map((id, index) => ({
          index,
          score: Math.max(0, ...p.pieces.map((p) => itemScore(p, id))),
        }))
        .sort((a, b) => b.score - a.score)[0];
      claimReward(g, best.index);
    }
    nextRound(g);
    if (!validGame(g)) throw new Error("Invalid live campaign state");
  }
}
const summary = rows
  .filter((r) => r.round >= 15)
  .map((r) => ({
    seed: r.seed,
    round: r.round,
    budget: r.budget,
    original: r.scores[0].winner,
    best: r.scores.some((s) => s.winner === 0)
      ? 0
      : r.scores.some((s) => s.winner === null)
        ? null
        : 1,
  }));
writeFileSync(
  `docs/analysis/pve-position-${RULES.version}.json`,
  JSON.stringify(
    {
      scope:
        "Four standard campaigns, normal paid commands. Alternative preparations use only owned units and items; changes are evaluated on clones and never committed to the campaign.",
      rows,
      summary,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
