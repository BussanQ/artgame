import { readFileSync, writeFileSync, readdirSync } from "node:fs";
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
import { synergies } from "../src/engine/synergies";
import type { Difficulty, AiProfileId } from "../src/engine/types";
const args = process.argv.slice(2);
const profileArg = args.findIndex((arg) => arg.startsWith("--profile="));
const requestedProfile: AiProfileId | undefined =
  profileArg < 0
    ? undefined
    : (args.splice(profileArg, 1)[0].slice("--profile=".length) as AiProfileId);
if (
  profileArg >= 0 &&
  !AI_PROFILES.some((p) => p.id === requestedProfile && p.id !== "free")
)
  throw Error("Unknown player survey profile");
const label =
  args[0] && !/^\d+$/.test(args[0])
    ? args.shift()!
    : `rotation-v${RULES.version.split("-")[1].replace(".", "")}`;
if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw Error("Invalid report label");
const seeds = args.length ? args.map(Number) : [173, 47, 311, 91, 137, 509];
if (seeds.some((s) => !Number.isInteger(s) || s < 0 || s > 0xffffffff))
  throw Error("Seeds must be uint32");
const COUNTER_FORMATIONS = [
  ["sniper", "狙击"],
  ["cavalry", "骑兵"],
  ["sea", "海神"],
  ["psychic", "灵能"],
  ["abnormal", "异能"],
  ["guardian", "护卫"],
  ["siege", "攻城"],
  ["blast", "爆破"],
  ["air", "空军"],
  ["raptor", "猛禽"],
  ["support", "支援"],
  ["summon", "召唤"],
  ["panda", "熊猫"],
  ["landwalker", "陆行者"],
] as const;
const runs = [];
for (const difficulty of ["relaxed", "standard", "veteran"] as Difficulty[])
  for (const seed of seeds) {
    const probe = createGame(seed),
      profile = requestedProfile ?? probe.players[1].aiProfile!;
    for (const mode of ["classic", "rotation"] as const) {
      const g = createGame(seed, mode);
      g.difficulty = difficulty;
      let firstThreeStar: number | null = null,
        peakThreeStars = 0,
        rounds = 0,
        attackLifestealHealing = 0,
        summonAttackLifestealHealing = 0,
        summonEnergy = 0,
        supportBursts = 0,
        landwalkerConflictRounds = 0,
        aiLandwalkerConflictRounds = 0;
      const puppetTierRounds = [0, 0, 0, 0];
      const opponentAurora = { rounds: 0, casts: 0, peakStacks: 0 };
      const opponentQi = {
        rounds: 0,
        starts: 0,
        releases: 0,
        interruptions: 0,
        lostTargets: 0,
      };
      const opponentTaotie = { rounds: 0, starts: 0, feasts: 0, healing: 0 };
      const aiPuppetUsage = g.players.slice(1).map((p) => ({
        playerId: p.id,
        profile: profileFor(p).id,
        rounds: 0,
        tierRounds: [0, 0, 0, 0],
        peakCount: 0,
        firstFourRound: null as number | null,
        firstSixRound: null as number | null,
        history: [] as {
          round: number;
          count: number;
          tier: number;
          gold: number;
          level: number;
          hp: number;
          lineup: { id: string; star: number }[];
          bench: { id: string; star: number }[];
        }[],
      }));
      const evolved = new Set<number>(),
        roundHistory = [];
      const unitUsage: Record<
        string,
        {
          rounds: number;
          stars: number[];
          casts: number;
          damage: number;
          criticalHits: number;
          peakGale: number;
          fullGaleAttacks: number;
          armorApplications: number;
          knockups: number;
          peakAurora: number;
          auroraUpgrades: number;
          qiReleases: number;
          taotieFeasts: number;
          taotieHealing: number;
          interruptions: number;
          lostTargets: number;
        }
      > = {};
      const aiUsage: Record<string, number> = {};
      const formationUsage = {
        sniper: [0, 0, 0],
        cavalry: [0, 0],
        sea: [0, 0, 0],
        psychic: [0, 0, 0],
        abnormal: [0, 0, 0, 0],
        guardian: [0, 0, 0],
        siege: [0, 0, 0],
        blast: [0, 0, 0],
        air: [0, 0, 0],
        raptor: [0, 0, 0],
        support: [0, 0, 0],
        summon: [0, 0],
        panda: [0, 0],
        landwalker: [0, 0],
        infantry: [0, 0, 0, 0],
        beast: [0, 0, 0, 0],
        vanguard: [0, 0, 0],
        assassin: [0, 0, 0],
      };
      const aiFormationUsage = {
        sniper: [0, 0, 0],
        cavalry: [0, 0],
        sea: [0, 0, 0],
        psychic: [0, 0, 0],
        abnormal: [0, 0, 0, 0],
        guardian: [0, 0, 0],
        siege: [0, 0, 0],
        blast: [0, 0, 0],
        air: [0, 0, 0],
        raptor: [0, 0, 0],
        support: [0, 0, 0],
        summon: [0, 0],
        panda: [0, 0],
        landwalker: [0, 0],
        infantry: [0, 0, 0, 0],
        beast: [0, 0, 0, 0],
        vanguard: [0, 0, 0],
        assassin: [0, 0, 0],
      };
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
        let roundLifesteal = 0,
          roundSummonLifesteal = 0,
          roundSummonEnergy = 0;
        const roundSupportSources = new Set<number>();
        for (const frame of result.battle.frames)
          for (const e of frame.effects) {
            if (
              !(
                (e.kind === "heal" && e.name === "普攻吸血") ||
                e.name === "召唤回能" ||
                e.name === "支援余辉"
              )
            )
              continue;
            const source = frame.fighters.find((f) => f.uid === e.source);
            if (!source || (source.homeSide ?? source.side) !== 0) continue;
            if (e.name === "召唤回能") {
              roundSummonEnergy += e.amount;
              continue;
            }
            if (e.name === "支援余辉") {
              roundSupportSources.add(e.source);
              continue;
            }
            if (source.summon) roundSummonLifesteal += e.amount;
            else roundLifesteal += e.amount;
          }
        attackLifestealHealing += roundLifesteal;
        summonAttackLifestealHealing += roundSummonLifesteal;
        summonEnergy += roundSummonEnergy;
        supportBursts += roundSupportSources.size;
        const enemyCrabs = new Set(
          result.right.filter((p) => p.defId === "skycrab").map((p) => p.uid),
        );
        if (enemyCrabs.size) {
          opponentAurora.rounds++;
          for (const frame of result.battle.frames) {
            opponentAurora.casts += frame.effects.filter(
              (e) =>
                enemyCrabs.has(e.source) &&
                e.kind === "cast" &&
                e.name === "极光电影",
            ).length;
            opponentAurora.peakStacks = Math.max(
              opponentAurora.peakStacks,
              ...frame.fighters
                .filter((f) => enemyCrabs.has(f.uid))
                .map((f) => f.aurora?.stacks ?? 0),
            );
          }
        }
        const formations = synergies(result.left, g.combatVersion);
        const enemyToads = new Set(
          result.right.filter((p) => p.defId === "skytoad").map((p) => p.uid),
        );
        if (enemyToads.size) {
          opponentTaotie.rounds++;
          for (const frame of result.battle.frames)
            for (const effect of frame.effects) {
              if (!enemyToads.has(effect.source)) continue;
              if (effect.kind === "cast" && effect.name === "饕餮")
                opponentTaotie.starts++;
              if (effect.kind === "haste" && effect.name === "饕餮狂暴")
                opponentTaotie.feasts++;
              if (effect.kind === "heal" && effect.name === "饕餮回复")
                opponentTaotie.healing += effect.amount;
            }
        }
        const enemyArhats = new Set(
          result.right.filter((p) => p.defId === "arhat").map((p) => p.uid),
        );
        if (enemyArhats.size) {
          opponentQi.rounds++;
          for (const frame of result.battle.frames)
            for (const effect of frame.effects) {
              if (!enemyArhats.has(effect.source)) continue;
              if (effect.name === "气波掌" && effect.kind === "cast")
                opponentQi.starts++;
              if (effect.name === "气波掌" && effect.kind === "pulse")
                opponentQi.releases++;
              if (
                effect.kind === "silence" &&
                ["施法中断", "蓄力中断"].includes(effect.name)
              )
                opponentQi.interruptions++;
              if (effect.kind === "silence" && effect.name === "目标丢失")
                opponentQi.lostTargets++;
            }
        }
        const landwalkerConflict = formations.some(
          (s) => s.trait === "陆行者" && s.conflicted,
        );
        if (landwalkerConflict) landwalkerConflictRounds++;
        for (const [key, trait] of COUNTER_FORMATIONS)
          formationUsage[key][
            formations.find((s) => s.trait === trait)?.tier ?? 0
          ]++;
        const puppets = formations.find((s) => s.trait === "傀儡");
        const infantry = formations.find((s) => s.trait === "步兵");
        const beasts = formations.find((s) => s.trait === "野兽");
        const vanguards = formations.find((s) => s.trait === "先锋");
        const assassins = formations.find((s) => s.trait === "刺杀");
        formationUsage.assassin[assassins?.tier ?? 0]++;
        formationUsage.infantry[infantry?.tier ?? 0]++;
        formationUsage.beast[beasts?.tier ?? 0]++;
        formationUsage.vanguard[vanguards?.tier ?? 0]++;
        puppetTierRounds[puppets?.tier ?? 0]++;
        rounds++;
        for (const piece of result.left) {
          const usage = (unitUsage[piece.defId] ??= {
            rounds: 0,
            stars: [0, 0, 0],
            casts: 0,
            damage: 0,
            criticalHits: 0,
            peakGale: 0,
            fullGaleAttacks: 0,
            armorApplications: 0,
            knockups: 0,
            peakAurora: 0,
            auroraUpgrades: 0,
            qiReleases: 0,
            taotieFeasts: 0,
            taotieHealing: 0,
            interruptions: 0,
            lostTargets: 0,
          });
          usage.rounds++;
          usage.peakAurora = Math.max(
            usage.peakAurora,
            ...result.battle.frames.map(
              (frame) =>
                frame.fighters.find((f) => f.uid === piece.uid)?.aurora
                  ?.stacks ?? 0,
            ),
          );
          usage.stars[piece.star - 1]++;
          usage.casts += result.battle.frames.reduce(
            (n, fr) =>
              n +
              fr.effects.filter(
                (e) => e.source === piece.uid && e.kind === "cast",
              ).length,
            0,
          );
          usage.criticalHits += result.battle.frames.reduce(
            (n, fr) =>
              n +
              fr.events.filter(
                (e) =>
                  e.attacker === piece.uid &&
                  (e.assassinCritical ||
                    (piece.defId === "bladethrall" && e.empowered)) &&
                  !e.skill &&
                  !e.evaded &&
                  !e.immune,
              ).length,
            0,
          );
          const galeAttacks = result.battle.frames.flatMap((fr) =>
            fr.events.filter((e) => e.attacker === piece.uid && e.gale),
          );
          usage.peakGale = Math.max(
            usage.peakGale,
            ...galeAttacks.map((e) => e.gale ?? 0),
          );
          usage.fullGaleAttacks += galeAttacks.filter(
            (e) => e.gale === 10,
          ).length;
          for (const frame of result.battle.frames)
            for (const effect of frame.effects) {
              if (effect.source !== piece.uid) continue;
              if (effect.kind === "break" && effect.name === "酸性减甲")
                usage.armorApplications++;
              if (effect.kind === "stun" && effect.name === "击飞")
                usage.knockups++;
              if (effect.kind === "haste" && effect.name === "极光增幅")
                usage.auroraUpgrades++;
              if (effect.kind === "pulse" && effect.name === "气波掌")
                usage.qiReleases++;
              if (effect.kind === "haste" && effect.name === "饕餮狂暴")
                usage.taotieFeasts++;
              if (effect.kind === "heal" && effect.name === "饕餮回复")
                usage.taotieHealing += effect.amount;
              if (
                effect.kind === "silence" &&
                ["施法中断", "蓄力中断"].includes(effect.name)
              )
                usage.interruptions++;
              if (effect.kind === "silence" && effect.name === "目标丢失")
                usage.lostTargets++;
            }
          usage.damage +=
            result.battle.frames
              .at(-1)!
              .fighters.find((f) => f.uid === piece.uid)?.damage ?? 0;
        }
        for (const bot of g.players.slice(1).filter((p) => p.hp > 0)) {
          const usage = aiPuppetUsage.find((u) => u.playerId === bot.id)!;
          const botFormations = synergies(bot.pieces, g.combatVersion);
          if (botFormations.some((s) => s.trait === "陆行者" && s.conflicted))
            aiLandwalkerConflictRounds++;
          for (const [key, trait] of COUNTER_FORMATIONS)
            aiFormationUsage[key][
              botFormations.find((s) => s.trait === trait)?.tier ?? 0
            ]++;
          aiFormationUsage.infantry[
            botFormations.find((s) => s.trait === "步兵")?.tier ?? 0
          ]++;
          aiFormationUsage.assassin[
            botFormations.find((s) => s.trait === "刺杀")?.tier ?? 0
          ]++;
          const formation = botFormations.find((s) => s.trait === "傀儡");
          aiFormationUsage.beast[
            botFormations.find((s) => s.trait === "野兽")?.tier ?? 0
          ]++;
          aiFormationUsage.vanguard[
            botFormations.find((s) => s.trait === "先锋")?.tier ?? 0
          ]++;
          const count = formation?.count ?? 0,
            tier = formation?.tier ?? 0;
          usage.rounds++;
          usage.tierRounds[tier]++;
          usage.peakCount = Math.max(usage.peakCount, count);
          if (count >= 4 && usage.firstFourRound === null)
            usage.firstFourRound = g.round;
          if (count >= 6 && usage.firstSixRound === null)
            usage.firstSixRound = g.round;
          if (usage.profile === "puppets")
            usage.history.push({
              round: g.round,
              count,
              tier,
              gold: bot.gold,
              level: bot.level,
              hp: bot.hp,
              lineup: bot.pieces
                .filter((p) => p.position !== null)
                .map((p) => ({ id: p.defId, star: p.star })),
              bench: bot.pieces
                .filter((p) => p.position === null)
                .map((p) => ({ id: p.defId, star: p.star })),
            });
          for (const piece of bot.pieces.filter((p) => p.position !== null))
            aiUsage[piece.defId] = (aiUsage[piece.defId] ?? 0) + 1;
        }
        roundHistory.push({
          summonEnergy: roundSummonEnergy,
          supportBursts: roundSupportSources.size,
          landwalkerConflict,
          attackLifestealHealing: roundLifesteal,
          summonAttackLifestealHealing: roundSummonLifesteal,
          counterFormations: Object.fromEntries(
            COUNTER_FORMATIONS.map(([key, trait]) => {
              const f = formations.find((s) => s.trait === trait);
              return [key, { count: f?.count ?? 0, tier: f?.tier ?? 0 }];
            }),
          ),
          round: g.round,
          puppetCount: puppets?.count ?? 0,
          puppetTier: puppets?.tier ?? 0,
          infantryCount: infantry?.count ?? 0,
          infantryTier: infantry?.tier ?? 0,
          beastCount: beasts?.count ?? 0,
          beastTier: beasts?.tier ?? 0,
          vanguardCount: vanguards?.count ?? 0,
          vanguardTier: vanguards?.tier ?? 0,
          assassinCount: assassins?.count ?? 0,
          assassinTier: assassins?.tier ?? 0,
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
        catalogVersion: g.catalogVersion,
        opponentTaotie,
        opponentQi,
        opponentAurora,
        summonEnergy,
        supportBursts,
        landwalkerConflictRounds,
        aiLandwalkerConflictRounds,
        attackLifestealHealing,
        summonAttackLifestealHealing,
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
        puppetTierRounds,
        formationUsage,
        aiFormationUsage,
        aiUsage,
        aiPuppetUsage: aiPuppetUsage.map((usage) => ({
          ...usage,
          rank: rankings(g).findIndex((p) => p.id === usage.playerId) + 1,
        })),
        history: roundHistory,
      };
      runs.push(run);
      console.log(
        `${mode}/${difficulty}/${seed}: #${run.rank}, 三星${run.uniqueThreeStars}, 首次${firstThreeStar ?? "无"}, 禁用${run.bannedSeries.join("/")}`,
      );
    }
  }
// Archive every engine/data module so a newly imported spell cannot silently escape the fingerprint.
const sourcePaths = [
  "scripts/rotation-survey.ts",
  ...["src/engine", "src/data"].flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `${dir}/${name}`),
  ),
].sort();
const sources = Object.fromEntries(
  sourcePaths.map((path) => [
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
  playerProfile: requestedProfile ?? "seeded-seat-1",
  seeds,
  policy:
    (requestedProfile
      ? "Paid standard commander keeps the explicitly requested preference for each classic/rotation pair, even when its main series is banned; this is a diagnostic preference, not the formal new-game profile allocation. "
      : "Paid standard commander uses the first opponent's viable rotation-seeded doctrine for each classic/rotation pair. ") +
    "Only available units can be bought; opponents follow chosen difficulty. No free money, units, rerolls or reward injection. Roster changes alter RNG choices; not a pure causal skill or human-win-rate estimate.",
  sources,
  summary,
  runs,
};
writeFileSync(
  `docs/analysis/${label}.json`,
  JSON.stringify(output, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
