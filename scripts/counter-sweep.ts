import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { UNITS, UNIT } from "../src/data/units";
import { deployLineup } from "../src/engine/ai";
import { simulateOutcome } from "../src/engine/battle";
import type { Piece, Player } from "../src/engine/types";
const version = process.argv[2] ?? "legions";
if (
  version !== "tactics" &&
  version !== "balanced" &&
  version !== "signature" &&
  version !== "summons" &&
  version !== "legions"
)
  throw new Error("Unknown combat version");
const sources = Object.fromEntries(
  [
    "src/engine/ai.ts",
    "src/engine/battle.ts",
  "src/engine/birdrider.ts",
  "src/engine/ironrooster.ts",
    "src/engine/abilities.ts",
    "src/engine/infantry-skills.ts",
    "src/engine/triggers.ts",
    "src/engine/summons.ts",
    "src/data/traits.ts",
    "src/data/skills.ts",
    "src/data/units.ts",
    "src/data/unit-stats.ts",
    "src/engine/types.ts",
    "scripts/counter-sweep.ts",
  ].map((f) => [f, createHash("sha256").update(readFileSync(f)).digest("hex")]),
);
const target = ["guard", "infantry", "sniper", "chariot", "cannon", "titan"];
function layout(
  ids: string[],
  offset: number,
  formation: "spread" | "compact",
) {
  const p: Player = {
    id: 0,
    name: "对照阵容",
    hp: 100,
    gold: 0,
    level: 6,
    xp: 0,
    streak: 0,
    pieces: ids.map((defId, i) => ({
      uid: offset + i + 1,
      defId,
      star: 2,
      position: 32 + i,
      items: [],
    })),
    shop: [],
    locked: false,
    inventory: [],
  };
  deployLineup(p, "standard", formation);
  return p.pieces;
}
const combinations: string[][] = [];
function collect(ids: string[], from: number, cost: number) {
  if (ids.length === 6) {
    if (cost === 15) combinations.push(ids);
    return;
  }
  for (let i = from; i <= UNITS.length - (6 - ids.length); i++)
    if (cost + UNITS[i].cost <= 15)
      collect([...ids, UNITS[i].id], i + 1, cost + UNITS[i].cost);
}
collect([], 0, 0);
const targets = {
  spread: layout(target, 100, "spread"),
  compact: layout(target, 100, "compact"),
};
const results: {
  ids: string[];
  formation: string;
  wins: number;
  draws: number;
  matches: number;
}[] = [];
for (const ids of combinations)
  for (const formation of ["spread", "compact"] as const) {
    const pieces = layout(ids, 0, formation);
    let wins = 0,
      draws = 0,
      matches = 0;
    for (const other of Object.values(targets))
      for (const side of [0, 1]) {
        const result =
          side === 0
            ? simulateOutcome(pieces, other, version)
            : simulateOutcome(other, pieces, version);
        matches++;
        if (result.winner === side) wins++;
        else if (result.winner === null) draws++;
      }
    results.push({ ids, formation, wins, draws, matches });
  }
results.sort((a, b) => b.wins - a.wins || b.draws - a.draws);
const distribution = Object.fromEntries(
  [0, 1, 2, 3, 4].map((w) => [w, results.filter((r) => r.wins === w).length]),
);
const report = {
  version,
  sources,
  target,
  budget: 45,
  star: 2,
  slots: 6,
  items: [],
  combinations: combinations.length,
  duels: results.length * 4,
  distribution,
  best: results.slice(0, 20),
};
writeFileSync(
  `docs/analysis/sniper-counter-${version}.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({ ...report, best: report.best.slice(0, 3) }, null, 2),
);
