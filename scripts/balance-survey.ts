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
import { validGame } from "../src/engine/persistence";
import { AI_PROFILES } from "../src/data/ai-profiles";
import { synergies } from "../src/engine/synergies";
import type { Difficulty } from "../src/engine/types";

// A repeatable gameplay survey, not a prediction of human win rates.
// Every commander uses paid gameplay commands, the finite shared pool and normal rewards.
const label = process.argv[2] ?? "current";
if (!/^[a-z0-9-]+$/.test(label))
  throw new Error("Use a lowercase report label");
const seeds =
  process.argv.length > 3 ? process.argv.slice(3).map(Number) : [41, 87];
if (
  seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
)
  throw new Error("Seeds must be uint32 integers");
const commanderPolicy = process.env.REDTIDES_SURVEY_POLICY ?? "standard";
if (!["standard", "compact", "veteran"].includes(commanderPolicy))
  throw new Error("Unknown survey policy");
const difficulties: Difficulty[] = ["relaxed", "standard", "veteran"];
interface SurveyRound {
  round: number;
  kind: "pvp" | "pve";
  winner: 0 | 1 | null;
  seconds: number;
  roundMs: number;
  gold: number;
  level: number;
  hp: number;
  lineup: { id: string; star: number; position: number | null }[];
  traits: string[];
}
interface SurveyRun {
  difficulty: Difficulty;
  profile: string;
  seed: number;
  rank: number;
  hp: number;
  rounds: SurveyRound[];
}
const runs: SurveyRun[] = [];
const sourceFiles = [
  "src/engine/ai.ts",
  "src/engine/game.ts",
  "src/engine/economy.ts",
  "src/engine/recruitment.ts",
  "src/engine/immortality.ts",
  "src/engine/wild-skills.ts",
  "src/engine/metamorphosis.ts",
  "src/engine/phoenix.ts",
  "src/engine/battle.ts",
  "src/engine/abilities.ts",
  "src/engine/infantry-skills.ts",
  "src/engine/triggers.ts",
  "src/engine/summons.ts",
  "src/engine/progression.ts",
  "src/engine/synergies.ts",
  "src/data/units.ts",
  "src/data/skills.ts",
  "src/data/traits.ts",
  "src/data/ai-profiles.ts",
  "src/data/items.ts",
  "src/data/encounters.ts",
  "src/engine/equipment.ts",
  "src/engine/random.ts",
];
const sources = Object.fromEntries(
  sourceFiles.map((path) => [
    path,
    createHash("sha256").update(readFileSync(path)).digest("hex"),
  ]),
);

const started = performance.now();
for (const difficulty of difficulties) {
  for (let profile = 1; profile <= 7; profile++) {
    for (const seed of seeds) {
      const game = createGame(seed);
      game.difficulty = difficulty;
      const rounds: SurveyRound[] = [];
      while (game.phase !== "finished") {
        const player = game.players[0];
        // Hold the test commander's decision strength constant across opponent difficulties.
        player.id = profile;
        game.difficulty =
          commanderPolicy === "veteran" ? "veteran" : "standard";
        try {
          prepareBot(game, player, { buy, sell, roll, buyXp });
          if (commanderPolicy === "compact")
            deployLineup(player, "standard", "compact");
        } finally {
          player.id = 0;
          game.difficulty = difficulty;
        }
        if (!validGame(game))
          throw new Error(
            `Invalid preparation: ${difficulty}/${profile}/${seed}/${game.round}`,
          );
        const prepareStart = performance.now();
        const result = startRound(game);
        const roundMs = performance.now() - prepareStart;
        if (!result) throw new Error("Commander did not field a legal army");
        rounds.push({
          round: game.round,
          kind: result.kind,
          winner: result.battle.winner,
          seconds: (result.battle.frames.length - 1) * 0.25,
          roundMs: Math.round(roundMs * 100) / 100,
          gold: player.gold,
          level: player.level,
          hp: player.hp,
          lineup: result.left.map((p) => ({
            id: p.defId,
            star: p.star,
            position: p.position,
          })),
          traits: synergies(result.left)
            .filter((s) => s.active)
            .map((s) => `${s.trait}${s.count}`),
        });
        settle(game, result);
        if (game.reward) {
          const best = game.reward.choices
            .map((id, index) => ({
              index,
              score: Math.max(0, ...player.pieces.map((p) => itemScore(p, id))),
            }))
            .sort((a, b) => b.score - a.score)[0];
          if (!claimReward(game, best.index))
            throw new Error("Reward not claimed");
        }
        nextRound(game);
        if (!validGame(game))
          throw new Error(
            `Invalid result: ${difficulty}/${profile}/${seed}/${game.round}`,
          );
      }
      const run = {
        difficulty,
        profile: AI_PROFILES[profile].name,
        seed,
        rank: rankings(game).findIndex((p) => p.id === 0) + 1,
        hp: game.players[0].hp,
        rounds,
      };
      runs.push(run);
    }
    console.log(
      `${difficulty} / ${AI_PROFILES[profile].name}: ${runs
        .slice(-seeds.length)
        .map((r) => `#${r.rank}@${r.rounds.length}`)
        .join(", ")}`,
    );
  }
}
const avg = (values: number[]) =>
  Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
const summarize = (subset: typeof runs) => {
  const rounds = subset.flatMap((r) => r.rounds),
    pvp = rounds.filter((r) => r.kind === "pvp"),
    pve = rounds.filter((r) => r.kind === "pve");
  return {
    games: subset.length,
    avgRank: avg(subset.map((r) => r.rank)),
    top4: subset.filter((r) => r.rank <= 4).length,
    first: subset.filter((r) => r.rank === 1).length,
    avgFinalRound: avg(subset.map((r) => r.rounds.length)),
    pvpWins: pvp.filter((r) => r.winner === 0).length,
    pvpRounds: pvp.length,
    draws: rounds.filter((r) => r.winner === null).length,
    pveWins: pve.filter((r) => r.winner === 0).length,
    pveRounds: pve.length,
    avgBattleSeconds: avg(rounds.map((r) => r.seconds)),
    avgRoundComputeMs: avg(rounds.map((r) => r.roundMs)),
    maxRoundComputeMs: Math.max(...rounds.map((r) => r.roundMs)),
    averageLateLevel: avg(
      rounds.filter((r) => r.round >= 20).map((r) => r.level),
    ),
    lateUnits: Object.fromEntries(
      [...new Set(rounds.flatMap((r) => r.lineup.map((p) => p.id)))]
        .sort()
        .map((id) => [
          id,
          rounds.filter(
            (r) => r.round >= 20 && r.lineup.some((p) => p.id === id),
          ).length,
        ]),
    ),
  };
};
const report = {
  label,
  seeds,
  commanderPolicy,
  sources,
  policy:
    "Commander policy held constant across enemy difficulties; normal paid commands; best itemScore reward; no injected currency or cards",
  elapsedSeconds: Math.round((performance.now() - started) / 1000),
  summary: summarize(runs),
  byDifficulty: Object.fromEntries(
    difficulties.map((d) => [
      d,
      summarize(runs.filter((r) => r.difficulty === d)),
    ]),
  ),
  byProfile: Object.fromEntries(
    AI_PROFILES.slice(1).map((p) => [
      p.name,
      summarize(runs.filter((r) => r.profile === p.name)),
    ]),
  ),
  runs,
};
const path = `docs/analysis/balance-${label}.json`;
writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      path,
      summary: report.summary,
      byDifficulty: Object.fromEntries(
        Object.entries(report.byDifficulty).map(([k, v]) => [
          k,
          { rank: v.avgRank, top4: v.top4, first: v.first },
        ]),
      ),
    },
    null,
    2,
  ),
);
