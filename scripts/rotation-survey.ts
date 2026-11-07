import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
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
import { catalogCost } from "../src/data/catalog";
import { pieceCopies } from "../src/engine/progression";
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
const captureArg = args.findIndex((arg) => arg.startsWith("--capture-round="));
const captureRound =
  captureArg < 0
    ? undefined
    : Number(args.splice(captureArg, 1)[0].slice("--capture-round=".length));
if (
  captureRound !== undefined &&
  (!Number.isInteger(captureRound) || captureRound < 1 || captureRound > 30)
)
  throw Error("Capture round must be between 1 and 30");
if (captureRound !== undefined) mkdirSync("tmp", { recursive: true });
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
      const opponentTar = { rounds: 0, launched: 0, detonated: 0 };
      const opponentLightning = {
        rounds: 0,
        attacks: 0,
        bounces: 0,
        damage: 0,
      };
      const opponentGospel = { rounds: 0, pulses: 0, energy: 0, peakTargets: 0 };
      const opponentStorm = { rounds: 0, launched: 0, hits: 0, energyRemoved: 0 };
      const opponentJungle = { rounds: 0, waves: 0, hits: 0, knockups: 0, landings: 0 };
      const opponentSecretOrb = { rounds:0,formed:0,pulses:0,hits:0,energyRemoved:0,interrupted:0 };
      const opponentSecretOrbByKind = {
        pvp: { ...opponentSecretOrb },
        pve: { ...opponentSecretOrb },
      };
      const aiOpeningUsage = g.players.slice(1).map(player=>({
        playerId:player.id,profile:profileFor(player).id,rounds:0,
        completeRounds:0,firstCompleteRound:null as number|null,monkRounds:0,
      }));
      const aiPuppetUsage = g.players.slice(1).map((p) => ({
        playerId: p.id,
        profile: profileFor(p).id,
        rounds: 0,
        tierRounds: [0, 0, 0, 0],
        peakCount: 0,
        firstFourRound: null as number | null,
        firstSixRound: null as number | null,
        firstThreeStarRound: null as number | null,
        threeStarRounds: 0,
        unitStars: {} as Record<string, number[]>,
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
          tarLaunched: number;
          tarDetonated: number;
          tarCenterHits: number;
          tarSplashHits: number;
          chainAttacks: number;
          chainBounces: number;
          chainDamage: number;
          chainEvades: number;
          stormLaunched: number;
          stormHits: number;
          stormEnergyRemoved: number;
          wushiForms: number;
          wushiSweeps: number;
          wushiSplashHits: number;
          wushiTaunts: number;
          shurikenLaunched: number;
          shurikenLandings: number;
          shurikenPulses: number;
          shurikenHits: number;
          shurikenInterrupted: number;
          secretOrbFormed: number;
          secretOrbPulses: number;
          secretOrbHits: number;
          secretOrbEnergyRemoved: number;
          secretOrbInterrupted: number;
          jungleWaves: number;
          jungleHits: number;
          jungleLandings: number;
          gospelPulses: number;
          peakGospelTargets: number;
          energyGiven: number;
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
        if (g.round === captureRound)
          writeFileSync(
            `tmp/${label}-${difficulty}-${mode}-${seed}.json`,
            JSON.stringify({ game: g, profile }, null, 2),
          );
        const economy = {
          startGold: p.gold,
          purchases: 0,
          refreshes: 0,
          xpBuys: 0,
          sales: 0,
          spent: 0,
          saleIncome: 0,
          trades: [] as {
            kind: "buy" | "sell";
            id: string;
            starsBefore: number[];
            price: number;
          }[],
          offers: [p.shop.slice()],
        };
        const actions = {
          buy(game: typeof g, player: typeof p, index: number) {
            const id = player.shop[index];
            const cost = id ? catalogCost(game, id) : 0;
            const starsBefore = player.pieces
              .filter((piece) => piece.defId === id)
              .map((piece) => piece.star);
            const ok = buy(game, player, index);
            if (ok) {
              economy.purchases++;
              economy.spent += cost;
              economy.trades.push({
                kind: "buy",
                id: id!,
                starsBefore,
                price: cost,
              });
            }
            return ok;
          },
          roll(game: typeof g, player: typeof p) {
            const ok = roll(game, player);
            if (ok) {
              economy.refreshes++;
              economy.spent += RULES.reroll;
              economy.offers.push(player.shop.slice());
            }
            return ok;
          },
          buyXp(game: typeof g, player: typeof p) {
            const ok = buyXp(game, player);
            if (ok) {
              economy.xpBuys++;
              economy.spent += 5;
            }
            return ok;
          },
          sell(game: typeof g, player: typeof p, uid: number) {
            const before = player.gold;
            const piece = player.pieces.find((piece) => piece.uid === uid);
            const starsBefore = player.pieces
              .filter((other) => other.defId === piece?.defId)
              .map((piece) => piece.star);
            const ok = sell(game, player, uid);
            if (ok) {
              economy.sales++;
              economy.saleIncome += player.gold - before;
              economy.trades.push({
                kind: "sell",
                id: piece!.defId,
                starsBefore,
                price: player.gold - before,
              });
            }
            return ok;
          },
        };
        let preparation:ReturnType<typeof prepareBot>;
        p.id = 1;
        p.aiProfile = profile;
        g.difficulty = "standard";
        try {
          preparation=prepareBot(g, p, actions);
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
        const opposingRiders = result.battle.frames
          .at(-1)!
          .fighters.filter((f) => (f.homeSide ?? f.side) === 1 && f.tar);
        if (opposingRiders.length) opponentTar.rounds++;
        const opposingThunder = result.battle.frames[0].fighters.filter(
          (f) => f.side === 1 && f.lightningChain,
        );
        if (opposingThunder.length) opponentLightning.rounds++;
        const opposingStorm = result.battle.frames.at(-1)!.fighters.filter(
          f => (f.homeSide ?? f.side) === 1 && f.storm);
        if (opposingStorm.length) opponentStorm.rounds++;
        const opposingOrbs=result.battle.frames.at(-1)!.fighters.filter(
          f=>(f.homeSide??f.side)===1&&f.secretOrb);
        if(opposingOrbs.length)opponentSecretOrb.rounds++;
        const orbKind=opponentSecretOrbByKind[result.kind];
        if(opposingOrbs.length)orbKind.rounds++;
        for(const f of opposingOrbs){
          opponentSecretOrb.formed+=f.secretOrb!.formed;
          opponentSecretOrb.pulses+=f.secretOrb!.pulses;
          opponentSecretOrb.hits+=f.secretOrb!.hits;
          opponentSecretOrb.energyRemoved+=f.secretOrb!.energyRemoved;
          opponentSecretOrb.interrupted+=f.secretOrb!.interrupted;
          for(const key of ["formed","pulses","hits","energyRemoved","interrupted"] as const)
            orbKind[key]+=f.secretOrb![key];
        }
        for (const f of opposingStorm) {
          opponentStorm.launched += f.storm!.launched;
          opponentStorm.hits += f.storm!.hits;
          opponentStorm.energyRemoved += f.storm!.energyRemoved;
        }
        const opposingTrees = result.battle.frames.at(-1)!.fighters.filter(
          f => (f.homeSide ?? f.side) === 1 && f.jungle);
        if (opposingTrees.length) opponentJungle.rounds++;
        for (const f of opposingTrees) {
          opponentJungle.waves += f.jungle!.waves;
          opponentJungle.hits += f.jungle!.hits;
          opponentJungle.knockups += f.jungle!.knockups;
          opponentJungle.landings += f.jungle!.landings;
        }
        const opposingAcolytes = result.battle.frames.at(-1)!.fighters.filter(
          (f) => (f.homeSide ?? f.side) === 1 && f.gospelAura,
        );
        if (opposingAcolytes.length) opponentGospel.rounds++;
        for (const f of opposingAcolytes) {
          opponentGospel.pulses += f.gospelAura!.pulses;
          opponentGospel.peakTargets = Math.max(opponentGospel.peakTargets, f.gospelAura!.peakTargets);
        }
        for (const frame of result.battle.frames)
          for (const effect of frame.effects)
            if (effect.kind === "energize" && opposingAcolytes.some((f) => f.uid === effect.source))
              opponentGospel.energy += effect.amount;
        for (const frame of result.battle.frames)
          for (const e of frame.events) {
            if (
              e.chainHop === undefined ||
              !opposingThunder.some((f) => f.uid === e.attacker)
            )
              continue;
            if (e.chainHop === 0) opponentLightning.attacks++;
            else opponentLightning.bounces++;
            opponentLightning.damage += e.amount;
          }
        for (const f of opposingRiders) {
          opponentTar.launched += f.tar!.launched;
          opponentTar.detonated += f.tar!.detonated;
        }
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
            tarLaunched: 0,
            tarDetonated: 0,
            tarCenterHits: 0,
            tarSplashHits: 0,
            chainAttacks: 0,
            chainBounces: 0,
            chainDamage: 0,
            chainEvades: 0,
            stormLaunched: 0,
            stormHits: 0,
            stormEnergyRemoved: 0,
            wushiForms: 0,
            wushiSweeps: 0,
            wushiSplashHits: 0,
            wushiTaunts: 0,
            shurikenLaunched: 0,
            shurikenLandings: 0,
            shurikenPulses: 0,
            shurikenHits: 0,
            shurikenInterrupted: 0,
            secretOrbFormed: 0,
            secretOrbPulses: 0,
            secretOrbHits: 0,
            secretOrbEnergyRemoved: 0,
            secretOrbInterrupted: 0,
            jungleWaves: 0,
            jungleHits: 0,
            jungleLandings: 0,
            gospelPulses: 0,
            peakGospelTargets: 0,
            energyGiven: 0,
            interruptions: 0,
            lostTargets: 0,
          });
          usage.rounds++;
          const rider = result.battle.frames
            .at(-1)!
            .fighters.find((f) => f.uid === piece.uid);
          usage.tarLaunched += rider?.tar?.launched ?? 0;
          usage.tarDetonated += rider?.tar?.detonated ?? 0;
          usage.stormLaunched += rider?.storm?.launched ?? 0;
          usage.stormHits += rider?.storm?.hits ?? 0;
          usage.stormEnergyRemoved += rider?.storm?.energyRemoved ?? 0;
          usage.wushiForms += rider?.wushi?.forms ?? 0;
          usage.wushiSweeps += rider?.wushi?.sweeps ?? 0;
          usage.wushiSplashHits += rider?.wushi?.splashHits ?? 0;
          usage.wushiTaunts += rider?.wushi?.taunts ?? 0;
          usage.shurikenLaunched += rider?.shuriken?.launched ?? 0;
          usage.shurikenLandings += rider?.shuriken?.landings ?? 0;
          usage.shurikenPulses += rider?.shuriken?.pulses ?? 0;
          usage.shurikenHits += rider?.shuriken?.hits ?? 0;
          usage.shurikenInterrupted += rider?.shuriken?.interrupted ?? 0;
          usage.secretOrbFormed += rider?.secretOrb?.formed ?? 0;
          usage.secretOrbPulses += rider?.secretOrb?.pulses ?? 0;
          usage.secretOrbHits += rider?.secretOrb?.hits ?? 0;
          usage.secretOrbEnergyRemoved += rider?.secretOrb?.energyRemoved ?? 0;
          usage.secretOrbInterrupted += rider?.secretOrb?.interrupted ?? 0;
          usage.jungleWaves += rider?.jungle?.waves ?? 0;
          usage.jungleHits += rider?.jungle?.hits ?? 0;
          usage.jungleLandings += rider?.jungle?.landings ?? 0;
          usage.gospelPulses += rider?.gospelAura?.pulses ?? 0;
          usage.peakGospelTargets = Math.max(usage.peakGospelTargets, rider?.gospelAura?.peakTargets ?? 0);
          if (rider?.tar)
            for (const frame of result.battle.frames)
              for (const e of frame.events) {
                if (e.attacker !== piece.uid || !e.skill || e.reflected)
                  continue;
                if (e.primary) usage.tarCenterHits++;
                else usage.tarSplashHits++;
              }
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
            for (const e of frame.events) {
              if (e.attacker !== piece.uid || e.chainHop === undefined)
                continue;
              if (e.chainHop === 0) usage.chainAttacks++;
              else usage.chainBounces++;
              usage.chainDamage += e.amount;
              if (e.evaded) usage.chainEvades++;
            }
          for (const frame of result.battle.frames)
            for (const effect of frame.effects) {
              if (effect.source !== piece.uid) continue;
              if (effect.kind === "energize") usage.energyGiven += effect.amount;
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
          const deployed = bot.pieces.filter(
            (piece) => piece.position !== null,
          );
          if (deployed.some((piece) => piece.star === 3)) {
            usage.threeStarRounds++;
            usage.firstThreeStarRound ??= g.round;
          }
          for (const piece of deployed) {
            const stars = (usage.unitStars[piece.defId] ??= [0, 0, 0]);
            stars[piece.star - 1]++;
          }
          const botFormations = synergies(bot.pieces, g.combatVersion);
          const opening=aiOpeningUsage.find(usage=>usage.playerId===bot.id)!;
          opening.rounds++;
          opening.monkRounds+=deployed.filter(piece=>piece.defId==="monk").length;
          if((botFormations.find(s=>s.trait==="熊猫")?.tier??0)>0){
            opening.completeRounds++;
            opening.firstCompleteRound??=g.round;
          }
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
          economy,
          bench: p.pieces
            .filter((piece) => piece.position === null)
            .map((piece) => ({
              id: piece.defId,
              star: piece.star,
              copies: pieceCopies(piece),
            })),
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
          planning: preparation ?? null,
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
        opponentTar,
        opponentLightning,
        opponentGospel,
        opponentStorm,
        opponentJungle,
        opponentSecretOrb,
        opponentSecretOrbByKind,
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
        aiOpeningUsage,
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
