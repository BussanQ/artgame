import { readFileSync, writeFileSync } from "node:fs";
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
} from "../src/engine/game";
import { prepareBot, deployLineup } from "../src/engine/ai";
import { claimReward, itemScore } from "../src/engine/equipment";
import { simulate } from "../src/engine/battle";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { UNIT } from "../src/data/units";
import { synergies } from "../src/engine/synergies";
import { validGame } from "../src/engine/persistence";
import type { Piece, Game, Player } from "../src/engine/types";
const label = process.argv[2] ?? "current";
if (!/^[a-z0-9-]+$/.test(label)) throw Error("Invalid label");
const names = {
  fleet: [
    "repair",
    "bomber",
    "ghostjet",
    "ark",
    "skycrab",
    "eel",
    "shark",
    "fish",
  ],
  siege: [
    "guard",
    "infantry",
    "sniper",
    "chariot",
    "cannon",
    "bull",
    "pangolin",
    "monk",
  ],
  pack: [
    "pangolin",
    "lion",
    "wolf",
    "bull",
    "deer",
    "panda",
    "monk",
    "cavalry",
  ],
  retinue: [
    "adept",
    "shark",
    "wolf",
    "guard",
    "turtle",
    "panda",
    "monk",
    "fish",
  ],
  brood: [
    "eyebug",
    "blastbug",
    "spider",
    "wasp",
    "guard",
    "monk",
    "tiger",
    "cavalry",
  ],
};
function layout(ids: string[], offset: number, compact: boolean): Piece[] {
  const p = createGame(1).players[0];
  p.level = ids.length;
  p.pieces = ids.map((defId, i) => ({
    uid: offset + i,
    defId,
    star: 2,
    position: 32 + i,
    items: [],
  }));
  deployLineup(p, "standard", compact ? "compact" : "spread");
  return p.pieces;
}
const duels = [];
for (const [name, ids] of Object.entries(names)) {
  if (name === "fleet") continue;
  for (const compact of [false, true])
    for (const enemyCompact of [false, true])
      for (const side of [0, 1] as const) {
        const a = layout(names.fleet, 1, compact),
          b = layout(ids, 101, enemyCompact);
        const battle = side === 0 ? simulate(a, b) : simulate(b, a),
          contributions = analyzeBattle(battle);
        duels.push({
          enemy: name,
          costA: names.fleet.reduce((n, id) => n + UNIT[id].cost * 3, 0),
          costB: ids.reduce((n, id) => n + UNIT[id].cost * 3, 0),
          compact,
          enemyCompact,
          side,
          winner:
            battle.winner === null
              ? "draw"
              : battle.winner === side
                ? "fleet"
                : "enemy",
          seconds: battle.frames.at(-1)!.tick * 0.25,
          contributions: contributions.sides[side].fighters,
        });
      }
}
const campaigns = [];
for (const seed of [137, 307]) {
  const g = createGame(seed),
    p = g.players[0];
  const rounds = [];
  while (g.phase !== "finished") {
    const trades: { kind: string; id: string; star?: number }[] = [];
    const actions = {
      buy(g: Game, p: Player, i: number) {
        const id = p.shop[i];
        const ok = buy(g, p, i);
        if (ok && id) trades.push({ kind: "buy", id });
        return ok;
      },
      sell(g: Game, p: Player, uid: number) {
        const piece = p.pieces.find((x) => x.uid === uid)!;
        const ok = sell(g, p, uid);
        if (ok)
          trades.push({ kind: "sell", id: piece.defId, star: piece.star });
        return ok;
      },
      roll,
      buyXp,
    };
    p.id = 4;
    try {
      prepareBot(g, p, actions);
    } finally {
      p.id = 0;
    }
    if (!validGame(g)) throw Error("invalid preparation");
    const result = startRound(g)!;
    rounds.push({
      round: g.round,
      hp: p.hp,
      gold: p.gold,
      level: p.level,
      winner: result.battle.winner,
      trades,
      owned: structuredClone(p.pieces),
      traits: synergies(p.pieces)
        .filter((s) => s.active)
        .map((s) => s.trait + s.count),
    });
    settle(g, result);
    if (g.reward) {
      const choices = g.reward.choices
        .map((id, index) => ({
          index,
          score: Math.max(0, ...p.pieces.map((p) => itemScore(p, id))),
        }))
        .sort((a, b) => b.score - a.score);
      claimReward(g, choices[0].index);
    }
    nextRound(g);
    if (!validGame(g)) throw Error("invalid result");
  }
  campaigns.push({
    seed,
    rank: rankings(g).findIndex((x) => x.id === 0) + 1,
    rounds,
  });
}
const files = [
  "src/engine/ai.ts",
  "src/engine/equipment.ts",
  "src/engine/battle.ts",
  "src/engine/abilities.ts",
  "src/engine/infantry-skills.ts",
  "src/data/units.ts",
  "src/data/ai-profiles.ts",
  "scripts/airsea-audit.ts",
  "src/engine/game.ts",
  "src/engine/recruitment.ts",
  "src/engine/immortality.ts",
  "src/engine/progression.ts",
  "src/engine/summons.ts",
  "src/engine/triggers.ts",
  "src/engine/synergies.ts",
  "src/engine/random.ts",
  "src/data/traits.ts",
  "src/data/skills.ts",
  "src/data/items.ts",
  "src/data/encounters.ts",
];
const sources = Object.fromEntries(
  files.map((path) => [
    path,
    createHash("sha256").update(readFileSync(path)).digest("hex"),
  ]),
);
const report = { sources, duels, campaigns };
writeFileSync(
  `docs/analysis/airsea-audit-${label}.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      duels: Object.keys(names)
        .filter((n) => n !== "fleet")
        .map((enemy) => ({
          enemy,
          wins: duels.filter((d) => d.enemy === enemy && d.winner === "fleet")
            .length,
          draws: duels.filter((d) => d.enemy === enemy && d.winner === "draw")
            .length,
          cost: duels.find((d) => d.enemy === enemy)?.costB,
        })),
      campaigns: campaigns.map((c) => ({
        seed: c.seed,
        rank: c.rank,
        air4Rounds: c.rounds.filter((r) => r.traits.includes("空军4")).length,
      })),
    },
    null,
    2,
  ),
);
