import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createGame,
  buy,
  sell,
  roll,
  buyXp,
  startRound,
  settle,
  nextRound,
  rankings,
} from "../src/engine/game.ts";
import { prepareBot } from "../src/engine/ai.ts";
import { claimReward, itemScore } from "../src/engine/equipment.ts";
import { validGame } from "../src/engine/persistence.ts";
import { UNIT } from "../src/data/units.ts";
// Capture 'before' on the prior worktree and 'after' on the changed worktree.
const label = process.argv[2];
if (!["before", "after"].includes(label)) throw Error("label");
const sourcePaths = [
  ...Object.keys(
    JSON.parse(
      readFileSync(
        "docs/analysis/balance-motorcycle-v021-validation.json",
        "utf8",
      ),
    ).sources,
  ),
  "src/engine/economy.ts",
  "src/data/unit-stats.ts",
  "src/engine/types.ts",
].filter(existsSync);
const sources = Object.fromEntries(
  sourcePaths.map((p) => [
    p,
    createHash("sha256").update(readFileSync(p)).digest("hex"),
  ]),
);
const runs = [];
for (let profile = 1; profile <= 7; profile++) {
  const g = createGame(137),
    rounds = [];
  g.difficulty = "standard";
  while (g.phase !== "finished") {
    const p = g.players[0];
    let purchases = 0,
      refreshes = 0,
      xpBuys = 0,
      spent = 0;
    const actions = {
      buy(g, p, i) {
        const cost = UNIT[p.shop[i] ?? "guard"].cost;
        const ok = buy(g, p, i);
        if (ok) {
          purchases++;
          spent += cost;
        }
        return ok;
      },
      sell,
      roll(g, p) {
        const ok = roll(g, p);
        if (ok) {
          refreshes++;
          spent += 2;
        }
        return ok;
      },
      buyXp(g, p) {
        const ok = buyXp(g, p);
        if (ok) {
          xpBuys++;
          spent += 5;
        }
        return ok;
      },
    };
    p.id = profile;
    try {
      prepareBot(g, p, actions);
    } finally {
      p.id = 0;
    }
    if (!validGame(g)) throw Error("prepare");
    const r = startRound(g)!;
    if (!r) throw Error("no army");
    const lineup = r.left.map((x) => ({
      id: x.defId,
      star: x.star,
      cost: UNIT[x.defId].cost,
    }));
    const snapshot = {
      round: g.round,
      purchases,
      refreshes,
      xpBuys,
      spent,
      level: p.level,
      gold: p.gold,
      lineup,
    };
    settle(g, r);
    if (!validGame(g)) throw Error("settle");
    rounds.push({ ...snapshot, income: g.history.at(-1)!.income });
    if (g.reward) {
      const best = g.reward.choices
        .map((id, index) => ({
          index,
          score: Math.max(0, ...p.pieces.map((x) => itemScore(x, id))),
        }))
        .sort((a, b) => b.score - a.score)[0];
      claimReward(g, best.index);
    }
    nextRound(g);
    if (!validGame(g)) throw Error("next");
  }
  runs.push({
    profile,
    rank: rankings(g).findIndex((p) => p.id === 0) + 1,
    rounds,
  });
}
const late = runs.flatMap((r) => r.rounds).filter((r) => r.round >= 20);
const avg = (list: number[]) =>
  Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 100) / 100;
const summary = {
  games: runs.length,
  lateRounds: late.length,
  averageFinalRound: avg(runs.map((r) => r.rounds.length)),
  averageRank: avg(runs.map((r) => r.rank)),
  averageLateIncome: avg(late.map((r) => r.income)),
  averageLateSpent: avg(late.map((r) => r.spent)),
  averageLateRefreshes: avg(late.map((r) => r.refreshes)),
  averageLateLevel: avg(late.map((r) => r.level)),
  averageLateThreeStars: avg(
    late.map((r) => r.lineup.filter((p) => p.star === 3).length),
  ),
  averageLateUpgradedExpensiveUnits: avg(
    late.map((r) => r.lineup.filter((p) => p.cost >= 4 && p.star >= 2).length),
  ),
};
writeFileSync(
  `docs/analysis/economy-v022-${label}.json`,
  JSON.stringify(
    {
      seed: 137,
      difficulty: "standard",
      policy:
        "7 commander preferences, normal paid actions, same economy for all 8 players; rounds >=20 are late; not human win rates",
      sources,
      summary,
      runs,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(summary));
