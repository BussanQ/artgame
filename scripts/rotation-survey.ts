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
import { prepareBot } from "../src/engine/ai";
import { availableUnits } from "../src/engine/rotation";
import { AI_PROFILES, profileFor } from "../src/data/ai-profiles";
import { claimReward, itemScore } from "../src/engine/equipment";
import { validGame } from "../src/engine/persistence";
import { RULES } from "../src/data/units";
import type { Difficulty } from "../src/engine/types";
const args = process.argv.slice(2);
const label =
  args[0] && !/^\d+$/.test(args[0])
    ? args.shift()!
    : `rotation-v${RULES.version.split("-")[1].replace(".", "")}`;
if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw Error("Invalid report label");
const seeds = args.length ? args.map(Number) : [173, 47, 311, 91, 137, 509];
if (seeds.some((s) => !Number.isInteger(s) || s < 0 || s > 0xffffffff))
  throw Error("Seeds must be uint32");
const runs = [];
for (const difficulty of ["relaxed", "standard", "veteran"] as Difficulty[])
  for (const seed of seeds) {
    const probe = createGame(seed),
      profile = probe.players[1].aiProfile!;
    for (const mode of ["classic", "rotation"] as const) {
      const g = createGame(seed, mode);
      g.difficulty = difficulty;
      let firstThreeStar: number | null = null,
        peakThreeStars = 0,
        rounds = 0;
      const evolved = new Set<number>(),
        roundHistory = [];
      const unitUsage: Record<
        string,
        { rounds: number; stars: number[]; casts: number; damage: number }
      > = {};
      const aiUsage: Record<string, number> = {};
      while (g.phase !== "finished") {
        const p = g.players[0];
        p.id = 1;
        p.aiProfile = profile;
        g.difficulty = "standard";
        try {
          prepareBot(g, p, { buy, sell, roll, buyXp });
        } finally {
          p.id = 0;
          delete p.aiProfile;
          g.difficulty = difficulty;
        }
        if (!validGame(g))
          throw Error(
            `Invalid prepare ${mode}/${difficulty}/${seed}/${g.round}`,
          );
        const three = p.pieces.filter((u) => u.star === 3);
        for (const u of three) evolved.add(u.uid);
        if (three.length && firstThreeStar === null) firstThreeStar = g.round;
        peakThreeStars = Math.max(peakThreeStars, three.length);
        const result = startRound(g);
        if (!result) throw Error("No army");
        rounds++;
        for (const piece of result.left) {
          const usage = (unitUsage[piece.defId] ??= {
            rounds: 0,
            stars: [0, 0, 0],
            casts: 0,
            damage: 0,
          });
          usage.rounds++;
          usage.stars[piece.star - 1]++;
          usage.casts += result.battle.frames.reduce(
            (n, fr) =>
              n +
              fr.effects.filter(
                (e) => e.source === piece.uid && e.kind === "cast",
              ).length,
            0,
          );
          usage.damage +=
            result.battle.frames
              .at(-1)!
              .fighters.find((f) => f.uid === piece.uid)?.damage ?? 0;
        }
        for (const bot of g.players.slice(1))
          for (const piece of bot.pieces.filter((p) => p.position !== null))
            aiUsage[piece.defId] = (aiUsage[piece.defId] ?? 0) + 1;
        roundHistory.push({
          round: g.round,
          gold: p.gold,
          level: p.level,
          hp: p.hp,
          threeStars: three.map((u) => u.defId),
          lineup: result.left.map((u) => ({ id: u.defId, star: u.star })),
          winner: result.battle.winner,
        });
        settle(g, result);
        if (g.reward) {
          const best = g.reward.choices
            .map((id, index) => ({
              index,
              value: Math.max(0, ...p.pieces.map((u) => itemScore(u, id))),
            }))
            .sort((a, b) => b.value - a.value)[0];
          claimReward(g, best.index);
        }
        nextRound(g);
        if (!validGame(g))
          throw Error(
            `Invalid settlement ${mode}/${difficulty}/${seed}/${g.round}`,
          );
      }
      const run = {
        mode,
        difficulty,
        seed,
        profile,
        bannedSeries: g.bannedSeries ?? [],
        available: availableUnits(g).length,
        rank: rankings(g).findIndex((p) => p.id === 0) + 1,
        rounds,
        firstThreeStar,
        uniqueThreeStars: evolved.size,
        peakThreeStars,
        opponentProfiles: g.players.slice(1).map((p) => profileFor(p).id),
        unitUsage,
        aiUsage,
        history: roundHistory,
      };
      runs.push(run);
      console.log(
        `${mode}/${difficulty}/${seed}: #${run.rank}, 三星${run.uniqueThreeStars}, 首次${firstThreeStar ?? "无"}, 禁用${run.bannedSeries.join("/")}`,
      );
    }
  }
const sources = Object.fromEntries(
  [
    "src/engine/rotation.ts",
    "src/engine/game.ts",
    "src/engine/ai.ts",
    "src/engine/recruitment.ts",
    "src/engine/persistence.ts",
    "src/data/units.ts",
    "src/data/ai-profiles.ts",
    "src/data/traits.ts",
    "src/engine/progression.ts",
    "src/engine/economy.ts",
    "src/engine/battle.ts",
    "src/engine/abilities.ts",
    "src/engine/ironrooster.ts",
    "src/engine/swordthrall.ts",
    "src/engine/infantry-skills.ts",
    "src/engine/summons.ts",
    "src/engine/triggers.ts",
    "src/engine/immortality.ts",
    "src/engine/phoenix.ts",
    "src/data/skills.ts",
    "scripts/rotation-survey.ts",
  ].map((path) => [
    path,
    createHash("sha256").update(readFileSync(path)).digest("hex"),
  ]),
);
const summary = Object.fromEntries(
  ["classic", "rotation"].map((mode) => {
    const rows = runs.filter((r) => r.mode === mode),
      reached = rows.filter((r) => r.firstThreeStar !== null);
    return [
      mode,
      {
        games: rows.length,
        rounds: rows.reduce((n, r) => n + r.rounds, 0),
        gamesWithThreeStar: reached.length,
        averageThreeStars:
          rows.reduce((n, r) => n + r.uniqueThreeStars, 0) / rows.length,
        averageFirstThreeStar: reached.length
          ? reached.reduce((n, r) => n + r.firstThreeStar!, 0) / reached.length
          : null,
        averageRank: rows.reduce((n, r) => n + r.rank, 0) / rows.length,
      },
    ];
  }),
);
const output = {
  rules: RULES.version,
  seeds,
  policy:
    "Paid standard commander uses the same viable doctrine for each classic/rotation pair; opponents follow chosen difficulty. No free money, units, rerolls or reward injection. Roster changes alter RNG choices; not a pure causal skill or human-win-rate estimate.",
  sources,
  summary,
  runs,
};
writeFileSync(
  `docs/analysis/${label}.json`,
  JSON.stringify(output, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
