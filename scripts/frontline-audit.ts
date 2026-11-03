import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createGame } from "../src/engine/game";
import { deployLineup, lineupScore } from "../src/engine/ai";
import { simulateOutcome } from "../src/engine/battle";
import { AI_PROFILES } from "../src/data/ai-profiles";
import { ENCOUNTERS, encounterArmy } from "../src/data/encounters";
import { ITEM } from "../src/data/items";
import { RULES } from "../src/data/units";
import type { Piece } from "../src/engine/types";

const label = process.argv[2] ?? "before";
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid report label");
// Reconstruct owned units/stars/items observed in the manual campaign. Original
// UIDs and every final position were not exported; this is a controlled fixture,
// not an exact replay of that browser save or a normal-economy campaign sample.
const owned: Piece[] = [
  ["fish", 2, ["staff"]],
  ["infantry", 2, []],
  ["guard", 2, []],
  ["wolf", 2, []],
  ["sniper", 2, []],
  ["bat", 2, []],
  ["cannon", 1, ["overdrive"]],
  ["shark", 2, ["staff"]],
  ["adept", 2, []],
  ["phoenix", 2, []],
  ["ark", 2, []],
].map(([defId, star, items], i) => ({
  uid: i + 1,
  defId: defId as string,
  star: star as number,
  items: items as string[],
  position: null,
}));
for (const p of owned)
  for (const item of p.items ?? [])
    if (!ITEM[item]) throw new Error(`Unknown item: ${item}`);
function combinations<T>(items: T[], count: number): T[][] {
  if (!count) return [[]];
  return items.flatMap((item, i) =>
    combinations(items.slice(i + 1), count - 1).map((tail) => [item, ...tail]),
  );
}
const enemy = encounterArmy(ENCOUNTERS.find((e) => e.round === 25)!);
function evaluate(pieces: Piece[], formation: "spread" | "compact") {
  const player = createGame().players[0];
  player.level = 8;
  player.pieces = structuredClone(pieces);
  deployLineup(player, "standard", formation);
  const board = player.pieces.filter((p) => p.position !== null);
  const outcome = simulateOutcome(board, enemy, "metamorph");
  return {
    formation,
    ids: board.map((p) => p.defId),
    positions: board.map((p) => p.position),
    score: lineupScore(board, AI_PROFILES[0]),
    winner: outcome.winner,
    seconds: outcome.final.tick * RULES.tickSeconds,
    health: [0, 1].map((side) =>
      outcome.final.fighters
        .filter((f) => (f.homeSide ?? f.side) === side)
        .reduce((n, f) => n + Math.max(0, f.hp), 0),
    ),
  };
}
const recommended = evaluate(owned, "spread");
const rows = combinations(owned, 8).flatMap((pieces) =>
  (["spread", "compact"] as const).map((formation) =>
    evaluate(pieces, formation),
  ),
);
const stats = (rows: ReturnType<typeof evaluate>[]) => ({
  count: rows.length,
  wins: rows.filter((r) => r.winner === 0).length,
  draws: rows.filter((r) => r.winner === null).length,
});
const summary = {
  all: stats(rows),
  withGuard: stats(rows.filter((r) => r.ids.includes("guard"))),
  withoutGuard: stats(rows.filter((r) => !r.ids.includes("guard"))),
};
const paths = [
  "scripts/frontline-audit.ts",
  ...["src/engine", "src/data"].flatMap((directory) =>
    readdirSync(directory)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `${directory}/${name}`),
  ),
].sort();
writeFileSync(
  `docs/analysis/frontline-${label}.json`,
  JSON.stringify(
    {
      scope:
        "Controlled reconstruction of manual-campaign ownership, exhaustive 8-of-11 subsets and two formations against round-25 neutral. No exact original UID/position/seed claim.",
      sources: Object.fromEntries(
        paths.map((path) => [
          path,
          createHash("sha256").update(readFileSync(path)).digest("hex"),
        ]),
      ),
      owned,
      enemy,
      recommended,
      summary,
      rows,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify({ recommended, summary }, null, 2));
