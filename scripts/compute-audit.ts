import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createGame,
  buy,
  sell,
  roll,
  buyXp,
  startRound,
  resumeRound,
  settle,
  nextRound,
} from "../src/engine/game";
import { prepareBot } from "../src/engine/ai";
import { claimReward } from "../src/engine/equipment";
import { simulate } from "../src/engine/battle";
import { validGame } from "../src/engine/persistence";
const paths = [
  "src/engine/game.ts",
  "src/engine/battle.ts",
  "src/engine/ai.ts",
  "src/compute/job.ts",
  "src/compute/client.ts",
  "scripts/compute-audit.ts",
];
const sources = Object.fromEntries(
  paths.map((path) => [
    path,
    createHash("sha256").update(readFileSync(path)).digest("hex"),
  ]),
);
const game = createGame(617);
game.difficulty = "veteran";
const rows = [];
while (game.phase !== "finished") {
  const p = game.players[0];
  p.id = 4;
  try {
    prepareBot(game, p, { buy, sell, roll, buyXp });
  } finally {
    p.id = 0;
  }
  const result = startRound(game)!;
  if ([1, 10, 20, 25, 30].includes(game.round)) {
    const alive = game.players.filter((p) => p.hp > 0);
    const full = () =>
      alive.map((p) => {
        const other =
          result.kind === "pve" || p.id === 0
            ? result.opponent
            : alive[
                (alive.indexOf(p) +
                  1 +
                  ((game.round - 1) % (alive.length - 1))) %
                  alive.length
              ];
        return {
          playerId: p.id,
          battle: simulate(p.pieces, other.pieces, game.combatVersion),
        };
      });
    const baseline = full(),
      expected = baseline.map(({ playerId, battle: b }) => ({
        playerId,
        won: b.winner === 0,
        damage: b.winner === 0 ? 0 : b.damage,
      }));
    if (JSON.stringify(expected) !== JSON.stringify(result.outcomes))
      throw new Error("outcome mismatch");
    const measure = (fn: () => unknown) => {
      fn();
      const times = [];
      for (let i = 0; i < 7; i++) {
        const before = performance.now();
        fn();
        times.push(performance.now() - before);
      }
      return +times.sort((a, b) => a - b)[3].toFixed(2);
    };
    rows.push({
      round: game.round,
      players: alive.length,
      fullSnapshotsMedianMs: measure(full),
      compactOutcomesMedianMs: measure(() => resumeRound(game)),
      oldFighterSnapshots: baseline.reduce(
        (n, { battle }) =>
          n + battle.frames.reduce((s, f) => s + f.fighters.length, 0),
        0,
      ),
      newFighterSnapshots:
        result.battle.frames.reduce((n, f) => n + f.fighters.length, 0) +
        baseline
          .filter((b) => b.playerId !== 0)
          .reduce(
            (n, { battle }) => n + battle.frames.at(-1)!.fighters.length,
            0,
          ),
    });
  }
  settle(game, result);
  if (game.reward) claimReward(game, 0);
  nextRound(game);
  if (!validGame(game)) throw new Error("invalid campaign");
}
const report = {
  scope:
    "One legal veteran campaign, seed 617/profile 4. Seven timed repetitions after warmup per sample; Node timings exclude UI, worker startup and structured-clone transfer. Old reference records every AI frame; current retains only player replay and AI final frame. Not device FPS.",
  sources,
  rows,
  finalRound: game.round,
};
writeFileSync(
  "docs/analysis/compute-performance.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(rows, null, 2));
