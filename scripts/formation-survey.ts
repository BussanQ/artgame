import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createGame } from "../src/engine/game";
import { deployLineup } from "../src/engine/ai";
import { simulateOutcome } from "../src/engine/battle";
import { UNIT } from "../src/data/units";
import { ENCOUNTERS, encounterArmy } from "../src/data/encounters";
import type { Piece } from "../src/engine/types";
const label = process.argv[2] ?? "current";
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid label");
const version = process.argv[3] ?? "legions";
if (
  version !== "tactics" &&
  version !== "balanced" &&
  version !== "signature" &&
  version !== "summons" &&
  version !== "legions"
)
  throw new Error("Unknown combat version");
const formations = ["spread", "compact"] as const;
const armies = {
  射手防线: ["guard", "infantry", "sniper", "chariot", "cannon", "titan"],
  突袭猎杀: ["panda", "wolf", "shadowblade", "lion", "pangolin", "monk"],
  荒原兽群: ["pangolin", "lion", "bull", "turtle", "wolf", "deer"],
  治疗支援: ["fish", "deer", "dragonfly", "guard", "monk", "titan"],
  范围轰击: ["chariot", "cannon", "bull", "master", "guard", "pangolin"],
  熊猫先锋: ["panda", "monk", "master", "wolf", "cavalry", "deer"],
};
const sourceFiles = [
  "src/engine/ai.ts",
  "src/engine/battle.ts",
  "src/engine/abilities.ts",
  "src/engine/infantry-skills.ts",
  "src/engine/triggers.ts",
  "src/engine/summons.ts",
  "src/data/units.ts",
  "src/data/traits.ts",
  "src/data/skills.ts",
  "src/data/encounters.ts",
  "scripts/formation-survey.ts",
];
const sources = Object.fromEntries(
  sourceFiles.map((f) => [
    f,
    createHash("sha256").update(readFileSync(f)).digest("hex"),
  ]),
);
function layout(
  ids: string[],
  formation: (typeof formations)[number],
  offset: number,
): Piece[] {
  const p = createGame().players[0];
  p.level = 6;
  p.pieces = ids.map((defId, i) => ({
    uid: offset + i + 1,
    defId,
    star: 2,
    position: 32 + i,
    items: [],
  }));
  deployLineup(p, "standard", formation);
  return p.pieces;
}
const duels: {
  a: string;
  b: string;
  formationA: string;
  formationB: string;
  side: number;
  winner: string | null;
  seconds: number;
  remainingA: number;
  remainingB: number;
}[] = [];
const names = Object.keys(armies) as (keyof typeof armies)[];
for (const a of names)
  for (const b of names.filter((name) => name >= a))
    for (const formationA of formations)
      for (const formationB of formations)
        for (const side of [0, 1]) {
          const left = layout(armies[a], formationA, 0),
            right = layout(armies[b], formationB, 100);
          const result =
            side === 0
              ? simulateOutcome(left, right, version)
              : simulateOutcome(right, left, version);
          const remaining = (team: number) =>
            result.final.fighters.filter((f) => f.side === team && f.hp > 0)
              .length;
          duels.push({
            a,
            b,
            formationA,
            formationB,
            side,
            winner:
              result.winner === null
                ? null
                : result.winner === side
                  ? "a"
                  : "b",
            seconds: result.final.tick * 0.25,
            remainingA: remaining(side),
            remainingB: remaining(1 - side),
          });
        }
const budgets = Object.fromEntries(
  names.map((name) => [
    name,
    armies[name].reduce((n, id) => n + UNIT[id].cost * 3, 0),
  ]),
);
if (new Set(Object.values(budgets)).size !== 1)
  throw new Error("Unequal budgets");
const summary = Object.fromEntries(
  names.map((name) => {
    const games = duels.filter(
      (d) => d.a !== d.b && (d.a === name || d.b === name),
    );
    return [
      name,
      {
        games: games.length,
        wins: games.filter((d) => d.winner === (d.a === name ? "a" : "b"))
          .length,
        draws: games.filter((d) => d.winner === null).length,
      },
    ];
  }),
);
const pivots = [];
for (const a of names)
  for (const b of names.filter((n) => n !== a))
    for (const defense of formations) {
      const scores = Object.fromEntries(
        formations.map((attack) => {
          const trials = duels.filter(
            (d) =>
              (d.a === a &&
                d.b === b &&
                d.formationA === attack &&
                d.formationB === defense) ||
              (d.a === b &&
                d.b === a &&
                d.formationA === defense &&
                d.formationB === attack),
          );
          return [
            attack,
            trials.reduce(
              (n, d) =>
                n +
                (d.winner === (d.a === a ? "a" : "b")
                  ? 1
                  : d.winner === null
                    ? 0.5
                    : 0),
              0,
            ),
          ];
        }),
      );
      if (scores.spread !== scores.compact)
        pivots.push({ attacker: a, defender: b, defense, ...scores });
    }
const pve = names.flatMap((name) =>
  formations.flatMap((formation) =>
    ENCOUNTERS.filter((e) => e.round >= 10).map((encounter) => {
      const result = simulateOutcome(
        layout(armies[name], formation, 0),
        encounterArmy(encounter),
        version,
      );
      return {
        name,
        formation,
        round: encounter.round,
        winner: result.winner,
        seconds: result.final.tick * 0.25,
      };
    }),
  ),
);
const report = {
  label,
  version,
  sources,
  scope:
    "Six slots, all two-star, 45 gold of copies per army, no items; swap attacker/defender; synthetic combat fixtures, not campaign win rates",
  armies,
  budgets,
  summary,
  pivots,
  pve,
  duels,
};
writeFileSync(
  `docs/analysis/formation-${label}.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      summary,
      spreadFavored: pivots.filter((p) => p.spread > p.compact),
      compactFavored: pivots.filter((p) => p.compact > p.spread),
      draws: duels.filter((d) => d.winner === null).length,
      total: duels.length,
    },
    null,
    2,
  ),
);
