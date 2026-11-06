import { advanceTarBombs, updateTarBombPositions } from "./tar";
import { lightningStrike } from "./lightning";
import { advanceGospel } from "./gospel";
import { advanceStormBolts } from "./thunderstorm";
import { advanceBombardments } from "./bombardment";
import { advanceTerminatorMissiles } from "./terminator";
import { expireWarcry } from "./warcry";
import { advanceTornadoes } from "./tornado";
import { advanceWildfireAction, advanceWildfirePulses, expireWildfires } from "./wildfire";
import { advanceBoneBlasts } from "./boneblast";
import {advanceThornBindAction,advanceThornBinds} from "./thornbind";
import {advanceGazes} from "./gaze";
import {advanceHiveAction,advanceHiveSkills,expireHiveStates,startHiveBurst} from "./hive";
import { advanceShurikenCast, advanceShurikenFields, expireShurikenCasts } from "./shuriken";
import { advanceSecretOrbAction, advanceSecretOrbPulses, expireSecretOrbs } from "./secret-orb";
import { advanceJungleLandings, jungleContains } from "./jungle";
import { advanceWushi, expireWushi, expireWushiTaunts, wushiStrike, wushiTauntTarget } from "./wushi";
import { bladeStrike, seedBladeStrikes } from "./bladethrall";
import { recordStaffAttack, retargetStaff } from "./staffthrall";
import { advanceBladeStorm } from "./swordthrall";
import { unitArmor, unitDefinition,unitAttackInterval,unitMinimumAttackInterval } from "../data/unit-stats";
import { seedAssassinStrikes } from "./assassins";
import {
  CURRENT_COMBAT_VERSION,
  hasBoneBlastRules,
  hasThornBindRules,
  hasHiveRules,
  hasGazeRules,
  hasRifleRules,
  hasWildfireRules,
  hasTornadoRules,
  hasWarcryRules,
  hasTerminatorRules,
  hasBombardmentRules,
  hasShurikenRules,
  hasSecretOrbRules,
  hasWushiControlRules,
  hasAmbushRules,
  hasCounterplayRules,
  hasLineageRules,
  hasAuroraRules,
  hasQiRules,
  hasTaotieRules,
  hasTarRules,
  hasLightningRules,
  hasGospelRules,
  hasStormRules,
  hasJungleRules,
  hasWushiRules,
} from "./types";
import { advanceBurn } from "./infantry-skills";
import { isPhoenixEgg, hatchPhoenix } from "./phoenix";
import { advanceHawkCombo, startHawkCombo } from "./metamorphosis";
import { advanceSonic, advanceWindup } from "./wild-skills";
import { startFaithArrow, advanceFaithArrow } from "./birdrider";
import { skillReady, usesEnergy, concealed, attackTargets } from "./triggers";
import { isUndying, expireUndying } from "./immortality";
import { equipmentStats } from "../data/items";
import { RULES, UNIT } from "../data/units";
import { synergies, traitBonuses } from "./synergies";
import {
  castSkill,
  damage,
  distance,
  attackInterval,
  gainMana,
  ATTACK_MANA,
  combatAttack,
  advanceAirSkills,
} from "./abilities";
import {
  AXE_THROW,
  ACID_POLLUTION,
  PANGOLIN_BURROW,
  SKILLS,
} from "../data/skills";
import type {
  Battle,
  Fighter,
  Piece,
  CombatEvent,
  CombatEffect,
  CombatVersion,
} from "./types";
export function army(
  pieces: Piece[],
  side: 0 | 1,
  version: CombatVersion = CURRENT_COMBAT_VERSION,
): Fighter[] {
  const definitionVersion = version;
  const bonuses = traitBonuses(pieces, version);
  const teamAttack = bonuses.get("傀儡")?.teamAttack ?? 0;
  const teamHaste = bonuses.get("野兽")?.teamHaste ?? 0;
  const teamLifesteal = bonuses.get("异能")?.teamLifesteal ?? 0;
  const metamorph =
    version === "metamorph" ||
    version === "infantry" ||
    version === "armored" ||
    version === "puppets" ||
    version === "wildfront" ||
    hasAmbushRules(version);
  if (metamorph) version = "fleet";
  const active = new Set(
    synergies(pieces, "legacy")
      .filter((s) => s.active)
      .map((s) => s.trait),
  );
  return pieces
    .filter((p) => p.position !== null)
    .map((p) => {
      const d = unitDefinition(p.defId, definitionVersion),
        scale = 2 ** (p.star - 1) * (p.encounterPower ?? 1),
        gear = equipmentStats(p.items),
        has = (t: (typeof d.traits)[number]) =>
          d.traits.includes(t) && active.has(t);
      const sum = (
        key:
          | "hp"
          | "armor"
          | "interval"
          | "mana"
          | "shield"
          | "attack"
          | "regen"
          | "skillPower"
          | "shred",
        // New traits only apply to the newly introduced units.
      ) => d.traits.reduce((n, t) => n + (bonuses.get(t)?.[key] ?? 0), 0);
      const hp = Math.round(
        d.hp * scale +
          gear.hp +
          (version === "legacy" ? (has("步兵") ? 200 : 0) : sum("hp")),
      );
      const pos = p.position!;
      const formationHaste =
        teamHaste +
        (d.traits.includes("野兽") ? (bonuses.get("野兽")?.haste ?? 0) : 0);
      const baseMagicResist =
        (d.magicResist ?? 0.2) +
        gear.magicResist +
        (["legions", "brood", "airsea", "fleet"].includes(version)
          ? (bonuses.get("召唤")?.summonWard ?? 0)
          : 0);
      const seaWard = d.flying ? (bonuses.get("海神")?.seaWard ?? 0) : 0;
      return {
        ...(hasRifleRules(definitionVersion) && d.id === "infantry" ? {rifle:{shots:0}} : {}),
        ...(hasGazeRules(definitionVersion) && d.id === "eyebug" ? {gaze:{selections:0,controls:0,manaDrained:0}} : {}),
        ...(hasHiveRules(definitionVersion) && d.id === "wasp" ? {hive:{volleys:0,needles:0,explosions:0,innerHits:0,outerHits:0,interrupted:0}} : {}),
        ...(hasThornBindRules(definitionVersion) && d.id === "vine"
          ? {thornbind:{pulses:0,hits:0,roots:0,healing:0,retargets:0,interrupted:0}} : {}),
        ...(hasBoneBlastRules(definitionVersion) && d.id === "bonedragon"
          ? {boneblast:{launched:0,detonated:0,hits:0,stuns:0,interrupted:0,orbs:[]}} : {}),
        ...(hasWildfireRules(definitionVersion) && d.id === "phoenix"
          ? {wildfire:{formed:0,pulses:0,hits:0,interrupted:0,eggs:0,hatches:0,brokenEggs:0}} : {}),
        ...(hasTornadoRules(definitionVersion) && d.id === "winddragon"
          ? {tornado:{launched:0,contacts:0,knockups:0,landings:0,vortices:[]}} : {}),
        ...(hasWarcryRules(definitionVersion) && d.id === "lion"
          ? {warcry:{roars:0,petrified:0,retaliations:0,retaliationDamage:0,retaliationShield:0,until:0,reflection:0}} : {}),
        ...(hasTerminatorRules(definitionVersion) && d.id === "titan"
          ? { terminator: { smallLaunched: 0, largeLaunched: 0, detonated: 0, hits: 0, missiles: [] } } : {}),
        ...(hasBombardmentRules(definitionVersion) && d.id === "ark"
          ? { bombardment: { launched: 0, hits: 0, raids: [] } } : {}),
        ...(hasSecretOrbRules(definitionVersion) && d.id === "monk"
          ? { secretOrb: { formed:0,pulses:0,hits:0,energyRemoved:0,interrupted:0 },innateRegen:true as const } : {}),
        ...(hasShurikenRules(definitionVersion) && d.id === "panda"
          ? { shuriken: { launched: 0, landings: 0, pulses: 0, hits: 0, interrupted: 0,
            blades: [], fields: [] } } : {}),
        ...(hasWushiRules(definitionVersion) && d.id === "master"
          ? { wushi: { forms: 0, sweeps: 0, splashHits: 0, interrupted: 0, until: 0, armor: 0,
            ...(hasWushiControlRules(definitionVersion) ? { taunts: 0 } : {}) } } : {}),
        ...(hasJungleRules(definitionVersion) && d.id === "treant"
          ? { jungle: { waves: 0, hits: 0, knockups: 0, landings: 0 }, innateRegen: true as const } : {}),
        ...(hasStormRules(definitionVersion) && d.id === "stormcaller"
          ? { storm: { launched: 0, hits: 0, energyRemoved: 0, bolts: [] } } : {}),
        ...(hasGospelRules(definitionVersion) && d.id === "acolyte"
          ? { gospelAura: { pulses: 0, peakTargets: 0, lastTick: -4, targets: [] } }
          : {}),
        ...(hasLightningRules(definitionVersion) && d.id === "thunderlord"
          ? { lightningChain: true as const }
          : {}),
        ...(hasTarRules(definitionVersion) && d.id === "motorcycle"
          ? { tar: { bombs: [], launched: 0, detonated: 0 } }
          : {}),
        ...(hasQiRules(definitionVersion) && d.id === "arhat"
          ? { qiSkill: true as const }
          : {}),
        ...(hasAuroraRules(definitionVersion) && d.id === "skycrab"
          ? { aurora: { stacks: 0 } }
          : {}),
        ...(d.traits.includes("狙击") && bonuses.get("狙击")?.armorPenetration
          ? { armorPenetration: bonuses.get("狙击")!.armorPenetration }
          : {}),
        ...(hasAmbushRules(definitionVersion) && d.id === "pangolin"
          ? { burrowSkill: true as const }
          : {}),
        ...(d.traits.includes("刺杀") && bonuses.get("刺杀")?.criticalChance
          ? {
              assassinCrit: {
                chance: bonuses.get("刺杀")!.criticalChance!,
                multiplier: bonuses.get("刺杀")!.criticalMultiplier!,
                attempts: 0,
                crits: 0,
              },
            }
          : {}),
        ...(teamAttack ? { teamAttack } : {}),
        ...(teamLifesteal ? { teamLifesteal } : {}),
        ...(bonuses.get("召唤")?.damageMana
          ? { damageManaBonus: bonuses.get("召唤")!.damageMana }
          : {}),
        ...((definitionVersion === "formations" ||
          hasCounterplayRules(definitionVersion)) &&
        (teamAttack ||
          (d.traits.includes("傀儡") && bonuses.get("傀儡")?.attack))
          ? {
              formationAttack:
                teamAttack +
                (d.traits.includes("傀儡")
                  ? (bonuses.get("傀儡")?.attack ?? 0)
                  : 0),
            }
          : {}),
        ...(teamHaste ? { teamHaste } : {}),
        ...(formationHaste ? { formationHaste } : {}),
        ...(d.id === "staffthrall"
          ? { gale: { target: null, stacks: 0, side } }
          : {}),
        ...(d.id === "bladethrall"
          ? { bladeCrit: { attempts: 0, crits: 0 } }
          : {}),
        ...(d.id === "birdrider" ? { bird: { shots: 0 } } : {}),
        ...(d.id === "phoenix"
          ? {
              phoenix: {
                spent: false,
                eggUntil: 0,
                bodyMaxHp: hp,
                hatched: false,
              },
            }
          : {}),
        ...(metamorph && d.id === "bloodhawk"
          ? { hawkForm: { active: false } }
          : {}),
        ...(d.traits.includes("猛禽") && bonuses.get("猛禽")?.groundBonus
          ? { groundBonus: bonuses.get("猛禽")!.groundBonus! }
          : {}),
        ...(d.traits.includes("陆行者") && bonuses.get("陆行者")?.trueAttack
          ? { trueAttack: true }
          : {}),
        ...(d.id === "skytoad"
          ? hasTaotieRules(definitionVersion)
            ? { taotie: { feasts: 0 }, innateRegen: true as const }
            : { devourSpent: false }
          : {}),
        ...(bonuses.get("灵能")?.reflection
          ? { reflection: bonuses.get("灵能")!.reflection! }
          : {}),
        ...(version === "fleet" &&
        d.traits.includes("不朽") &&
        bonuses.get("不朽")?.immortal
          ? {
              immortal: {
                duration: bonuses.get("不朽")!.immortal!,
                until: 0,
                spent: false,
              },
            }
          : {}),
        ...(version === "airsea" || version === "fleet"
          ? {
              air: {
                ...(bonuses.get("猛禽")?.airGroundBonus
                  ? { groundBonus: bonuses.get("猛禽")!.airGroundBonus }
                  : {}),
                ...(bonuses.get("攻城")?.siegeDirect
                  ? { siegeDirect: true as const }
                  : {}),
                ...(seaWard ? { seaWard, seaBaseResist: baseMagicResist } : {}),
                flying: !!d.flying,
                evasion: d.flying ? (bonuses.get("空军")?.evasion ?? 0) : 0,
                attempts: 0,
                seaMana: d.flying ? (bonuses.get("海神")?.seaMana ?? 0) : 0,
                seaTick: -1,
                siege: bonuses.get("攻城")?.siege ?? 0,
                magicBreak: 0,
                antiAir: d.id === "cannon",
                phaseUntil: 0,
              },
            }
          : {}),
        ...(version === "brood" || version === "airsea" || version === "fleet"
          ? {
              homeSide: side,
              ...(d.id === "blastbug" ? { deathBurst: "ready" as const } : {}),
              ...(d.id === "spider" ? { charmCast: "ready" as const } : {}),
            }
          : {}),
        ...(version === "legions" ||
        version === "brood" ||
        version === "airsea" ||
        version === "fleet"
          ? {
              summonWard: bonuses.get("召唤")?.summonWard ?? 0,
              ...(["adept", "shark"].includes(d.id)
                ? {
                    summoning: {
                      kind:
                        d.id === "adept"
                          ? ("puppet" as const)
                          : ("sentinel" as const),
                      readyAt: 0,
                      spent: false,
                    },
                  }
                : {}),
            }
          : {}),
        ...((version === "summons" ||
          version === "legions" ||
          version === "brood" ||
          version === "airsea" ||
          version === "fleet") &&
        d.id === "wolf"
          ? { packCall: "ready" as const }
          : {}),
        ...(version === "signature" ||
        version === "summons" ||
        version === "legions" ||
        version === "brood" ||
        version === "airsea" ||
        version === "fleet"
          ? { signature: { casts: 0, attacks: 0, concealed: false } }
          : {}),
        uid: p.uid,
        defId: p.defId,
        star: p.star,
        side,
        x: side === 0 ? pos % 8 : 7 - (pos % 8),
        y: side === 0 ? Math.floor(pos / 8) : 7 - Math.floor(pos / 8),
        hp,
        maxHp: hp,
        attack:
          (d.attack * scale + gear.attack) *
          (version === "legacy"
            ? (has("狙击") ? 1.25 : 1) * (has("刺杀") ? 1.35 : 1)
            : 1 + sum("attack") + teamAttack),
        armor:
          unitArmor(d, p.star) +
          gear.armor +
          (version === "legacy" ? (has("装甲") ? 4 : 0) : sum("armor")),
        range: d.range,
        interval: Math.max(
          unitMinimumAttackInterval(d,definitionVersion),
          unitAttackInterval(d,p.star,definitionVersion) * (1 - gear.haste) -
            (version === "legacy" ? (has("野兽") ? 1 : 0) : sum("interval")),
        ),
        cooldown: 0,
        mana:
          (hasRifleRules(definitionVersion) && d.id === "infantry") ||
          (hasGospelRules(definitionVersion) && d.id === "acolyte") ||
          (hasLightningRules(definitionVersion) && d.id === "thunderlord") ||
          ["birdrider", "bladethrall", "staffthrall"].includes(d.id)
            ? 0
            : (version === "signature" ||
                  version === "summons" ||
                  version === "legions" ||
                  version === "brood" ||
                  version === "airsea" ||
                  version === "fleet") &&
                ["cavalry", "turtle", "tiger"].includes(p.defId)
              ? 0
              : Math.min(
                  100,
                  (version === "legacy"
                    ? has("熊猫")
                      ? 100
                      : 0
                    : sum("mana")) +
                    gear.mana +
                    (version === "fleet" && d.id === "bomber"
                      ? 50
                      : (d.initialMana ?? 0)),
                ),
        lifesteal: gear.lifesteal + teamLifesteal,
        skillPower:
          1 + gear.skillPower + (version === "legacy" ? 0 : sum("skillPower")),
        ...(bonuses.get("装甲")?.regen && d.traits.includes("装甲")
          ? { armorRegen: bonuses.get("装甲")!.regen }
          : {}),
        regeneration:
          (version === "legacy" ? (has("先锋") ? 8 : 0) : sum("regen")) +
          (d.regeneration ?? 0) * RULES.tickSeconds,
        attackShred: version === "legacy" ? 0 : sum("shred"),
        supportHeal:
          version === "legacy"
            ? 0
            : d.traits.includes("支援")
              ? (bonuses.get("支援")?.supportHeal ?? 0)
              : 0,
        supportMana:
          version === "legacy"
            ? 0
            : d.traits.includes("支援")
              ? (bonuses.get("支援")?.supportMana ?? 0)
              : 0,
        armorBuff: 0,
        armorBuffUntil: 0,
        manaLockUntil: 0,
        magicResist: seaWard
          ? Math.min(0.75, baseMagicResist + seaWard)
          : baseMagicResist,
        damage: 0,
        flash: false,
        shield: version === "legacy" ? (has("护卫") ? 250 : 0) : sum("shield"),
        shieldUntil: RULES.maxTicks + 1,
        stunUntil: 0,
        hasteUntil: 0,
        armorBreak: 0,
        armorBreakUntil: 0,
        healing: 0,
        absorbed: 0,
      };
    });
}
export function openingJumps(
  fighters: Fighter[],
  pieces: Piece[][],
  version: CombatVersion,
) {
  if (version === "legacy") return;
  for (const f of fighters
    .filter(
      (f) =>
        unitDefinition(f.defId, version).traits.includes("刺杀") &&
        (hasAmbushRules(version) ||
          synergies(pieces[f.side], version).some(
            (s) => s.trait === "刺杀" && s.active,
          )),
    )
    .sort((a, b) => a.uid - b.uid)) {
    const targets = fighters
      .filter((e) => e.side !== f.side)
      .sort(
        (a, b) =>
          Number(b.range > 1) - Number(a.range > 1) ||
          distance(f, b) - distance(f, a) ||
          a.uid - b.uid,
      );
    for (const target of targets) {
      const cell = [
        [0, 1],
        [1, 0],
        [-1, 0],
        [0, -1],
      ]
        .map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy }))
        .find(
          (p) =>
            p.x >= 0 &&
            p.x < 8 &&
            p.y >= 0 &&
            p.y < 8 &&
            !fighters.some((e) => e.hp > 0 && e.x === p.x && e.y === p.y),
        );
      if (cell) {
        f.x = cell.x;
        f.y = cell.y;
        break;
      }
    }
  }
}
function runBattle(
  left: Piece[],
  right: Piece[],
  version: CombatVersion,
  recordFrames: boolean,
): Battle {
  const formationVersion = version;
  const fighters = [...army(left, 0, version), ...army(right, 1, version)];
  if (hasCounterplayRules(version)) {
    const penalties = [left, right].map(
      (p) => traitBonuses(p, version).get("骑兵")?.enemyManaPenalty ?? 0,
    );
    for (const f of fighters)
      if (penalties[1 - f.side]) f.energyPenalty = penalties[1 - f.side];
  }
  seedBladeStrikes(fighters);
  seedAssassinStrikes(fighters);
  if (
    version === "infantry" ||
    version === "armored" ||
    version === "puppets" ||
    version === "wildfront" ||
    hasAmbushRules(version)
  ) {
    const reductions = [left, right].map(
      (pieces) => traitBonuses(pieces, version).get("步兵")?.enemyArmor ?? 0,
    );
    for (const f of fighters)
      if (reductions[1 - f.side]) f.infantryArmorBreak = reductions[1 - f.side];
  }
  if (
    version === "metamorph" ||
    version === "infantry" ||
    version === "armored" ||
    version === "puppets" ||
    version === "wildfront" ||
    hasAmbushRules(version)
  )
    version = "fleet";
  if (
    !hasLineageRules(formationVersion) &&
    (version === "brood" || version === "airsea" || version === "fleet")
  ) {
    const suppression = [left, right].map((pieces) =>
      synergies(pieces, version).some((s) => s.trait === "异能" && s.active),
    );
    for (const f of fighters)
      f.energyMultiplier = suppression[1 - f.side] ? 0.75 : 1;
  }
  openingJumps(fighters, [left, right], formationVersion);
  if (version === "airsea" || version === "fleet") {
    const reductions = [left, right].map(
      (pieces) =>
        traitBonuses(pieces, formationVersion).get("爆破")?.magicBreak ?? 0,
    );
    for (const f of fighters) {
      f.air!.magicBreak = reductions[1 - f.side];
      f.magicResist = Math.max(-0.25, f.magicResist - f.air!.magicBreak);
    }
  }
  for (const f of fighters)
    if (f.signature) f.signature.concealed = concealed(f, fighters);
  const frames: Battle["frames"] = recordFrames
    ? [
        {
          tick: 0,
          fighters: structuredClone(fighters),
          events: [],
          effects: [],
        },
      ]
    : [];
  let lastTick = 0;
  for (let tick = 1; tick <= RULES.maxTicks; tick++) {
    if (
      !fighters.some((f) => (f.homeSide ?? f.side) === 0 && f.hp > 0) ||
      !fighters.some((f) => (f.homeSide ?? f.side) === 1 && f.hp > 0)
    )
      break;
    const events: CombatEvent[] = [];
    const effects: CombatEffect[] = [];
    const context = { fighters, tick, events, effects };
    expireWushi(context);
    expireWushiTaunts(context);
    expireShurikenCasts(context);
    for (const f of fighters) {
      f.flash = false;
      if (f.bladeStorm && (f.hp <= 0 || f.bladeStorm.until <= tick))
        delete f.bladeStorm;
      if (f.charm && f.charm.until <= tick) {
        f.side = f.charm.side;
        f.attack = f.charm.attack;
        delete f.charm;
      }
      if (f.shieldUntil <= tick) f.shield = 0;
      if (f.armorBreakUntil <= tick) f.armorBreak = 0;
      if (f.armorBuffUntil <= tick) f.armorBuff = 0;
      if (f.slow && f.slow.until <= tick) delete f.slow;
      if (f.knockup && (f.knockup.until <= tick || f.hp <= 0)) delete f.knockup;
      if (f.corrosion) {
        f.corrosion = f.corrosion.filter((c) => c.until > tick);
        if (!f.corrosion.length || f.hp <= 0) delete f.corrosion;
      }
      if (f.taotie?.rage && (f.taotie.rage.until <= tick || f.hp <= 0))
        delete f.taotie.rage;
      if (f.attackBoost && f.attackBoost.until <= tick) delete f.attackBoost;
      if (f.command) {
        f.command = f.command.filter((grant) => grant.until > tick);
        if (!f.command.length) delete f.command;
      }
    }
    expireUndying(context);
    hatchPhoenix(context);
    expireWarcry(context);
    advanceJungleLandings(context);
    advanceSonic(context);
    advanceBurn(context);
    advanceTarBombs(context);
    advanceStormBolts(context);
    advanceBombardments(context);
    advanceTerminatorMissiles(context);
    advanceTornadoes(context);
    advanceBoneBlasts(context);
    advanceHiveSkills(context);
    advanceThornBinds(context);
    advanceGazes(context);
    advanceShurikenFields(context);
    advanceSecretOrbPulses(context);
    advanceWildfirePulses(context);
    advanceGospel(context);
    // Alternate initiative each tick to avoid permanent left-side first-action priority.
    const order =
      tick % 2
        ? [...fighters].reverse()
        : version === "summons" ||
            version === "legions" ||
            version === "brood" ||
            version === "airsea" ||
            version === "fleet"
          ? [...fighters]
          : fighters;
    for (const f of order) {
      if (f.hp <= 0 || isPhoenixEgg(f)) continue;
      if (f.regeneration && !isUndying(f)) {
        const restored = Math.min(f.maxHp - f.hp, f.regeneration);
        f.hp += restored;
        // Preserve historical vanguard accounting; record actual armor self-healing.
        if (f.armorRegen || f.innateRegen) f.healing += restored;
      }
      if (
        ((version === "fleet" && f.air?.cast) ||
          f.windup ||
          f.wushi?.casting ||
          f.shuriken?.casting ||
          f.secretOrb?.casting || f.secretOrb?.channel ||
          f.wildfire?.casting || f.wildfire?.channel || f.thornbind?.channel ||
          f.hive?.casting || f.hive?.burst || f.hive?.actedAt===tick ||
          f.combo ||
          f.bird?.draw) &&
        f.cooldown > 0
      )
        f.cooldown--;
      const spinning = advanceBladeStorm(context, f);
      if (f.hp <= 0) continue;
      if (advanceWushi(context, f)) continue;
      if (advanceShurikenCast(context, f)) continue;
      if (advanceSecretOrbAction(context, f)) continue;
      if (advanceWildfireAction(context, f)) continue;
      if (advanceThornBindAction(context, f)) continue;
      if (advanceHiveAction(context, f)) continue;
      if (advanceFaithArrow(context, f)) continue;
      if (advanceHawkCombo(context, f)) continue;
      if (advanceWindup(context, f)) continue;
      if (advanceAirSkills(context, f)) continue;
      const enemies = attackTargets(f, fighters, tick).sort(
        (a, b) =>
          (f.air?.antiAir
            ? Number(!!b.air?.flying) - Number(!!a.air?.flying)
            : 0) ||
          distance(f, a) - distance(f, b) ||
          a.uid - b.uid,
      );
      const tauntTarget = wushiTauntTarget(context, f);
      const target = tauntTarget ??
        ((f.gale &&
          enemies.find(
            (e) => e.uid === f.gale!.target && distance(f, e) <= f.range,
          )) ||
        enemies[0]);
      retargetStaff(f, target);
      if (!target) continue;
      if (f.cooldown > 0) f.cooldown--;
      if (f.cooldown > 0 && !spinning) continue;
      if (f.stunUntil > tick) continue;
      const injuredAlly =
        f.defId === "monk" && !f.secretOrb &&
        fighters.some(
          (a) =>
            a.side === f.side &&
            a.hp > 0 &&
            !isUndying(a) &&
            a.hp < a.maxHp &&
            distance(f, a) <= SKILLS.monk.radius,
        );
      const jungleTarget = f.jungle ? enemies.find((enemy) => jungleContains(f, enemy)) : undefined;
      const canCast =
        !tauntTarget &&
        skillReady(f) &&
        (f.defId !== "monk" || !!f.secretOrb || injuredAlly) &&
        (distance(f, target) <= f.range ||
          !!jungleTarget ||
          !!f.wushi ||
          (f.defId === "axethrall" && distance(f, target) <= AXE_THROW.range) ||
          (f.defId === "venombeast" &&
            distance(f, target) <= ACID_POLLUTION.range) ||
          (f.burrowSkill && distance(f, target) <= PANGOLIN_BURROW.range) ||
          injuredAlly ||
          (f.defId === "panda" && !f.shuriken) ||
          [
            "wolf",
            "cavalry",
            "bull",
            "shadowblade",
            "turtle",
            "fish",
            "deer",
            "adept",
            "shark",
            "repair",
            "medic",
            "ghostjet",
            "bloodhawk",
          ].includes(f.defId));
      if (canCast && castSkill(context, f, jungleTarget ?? target)) {
        f.cooldown += attackInterval(f, tick);
      } else if (distance(f, target) > f.range) {
        f.cooldown = 0;
        const occupied = new Set(
          fighters.filter((e) => e.hp > 0).map((e) => `${e.x},${e.y}`),
        );
        // BFS finds a free attack position, including detours around allies.
        const queue = [
            { x: f.x, y: f.y, first: null as { x: number; y: number } | null },
          ],
          seen = new Set([`${f.x},${f.y}`]);
        while (queue.length) {
          const at = queue.shift()!;
          if (
            at.first &&
            Math.abs(at.x - target.x) + Math.abs(at.y - target.y) <= f.range
          ) {
            f.x = at.first.x;
            f.y = at.first.y;
            break;
          }
          for (const [dx, dy] of [
            [0, -1],
            [-1, 0],
            [1, 0],
            [0, 1],
          ]) {
            const x = at.x + dx,
              y = at.y + dy,
              key = `${x},${y}`;
            if (
              x < 0 ||
              x > 7 ||
              y < 0 ||
              y > 7 ||
              seen.has(key) ||
              occupied.has(key)
            )
              continue;
            seen.add(key);
            queue.push({ x, y, first: at.first ?? { x, y } });
          }
        }
      } else {
        if (spinning) continue;
        if (f.signature) f.signature.attacks++;
        if(f.rifle)f.rifle.shots++;
        if (f.damageManaBonus && usesEnergy(f)) f.attackManaReady = true;
        gainMana(f, ATTACK_MANA, tick);
        const gale = recordStaffAttack(f, target);
        if (
          !startHiveBurst(context,f,target) &&
          !startFaithArrow(context, f, target) &&
          !startHawkCombo(context, f, target) &&
          !lightningStrike(context, f, target) &&
          !wushiStrike(context, f, target) &&
          !bladeStrike(context, f, target)
        )
          damage(
            context,
            f,
            target,
            combatAttack(f, tick),
            "physical",
            false,
            true,
            0,
            false,
            false,
            false,
            false,
            gale,
          );
        f.cooldown += attackInterval(f, tick);
      }
    }
    expireWushiTaunts(context);
    expireHiveStates(context);
    expireShurikenCasts(context);
    expireSecretOrbs(context);
    expireWildfires(context);
    for (const f of fighters) {
      if (f.signature) f.signature.concealed = concealed(f, fighters, tick);
      if (f.gale)
        retargetStaff(
          f,
          attackTargets(f, fighters, tick).find(
            (e) => e.uid === f.gale!.target,
          ),
        );
    }
    updateTarBombPositions(context);
    lastTick = tick;
    if (recordFrames)
      frames.push({
        tick,
        fighters: structuredClone(fighters),
        events,
        effects,
      });
  }
  if (!recordFrames)
    frames.push({
      tick: lastTick,
      fighters: structuredClone(fighters),
      events: [],
      effects: [],
    });
  const alive = [0, 1].map((side) =>
    fighters.filter((f) => (f.homeSide ?? f.side) === side && f.hp > 0),
  );
  const winner =
    alive[0].length && !alive[1].length
      ? 0
      : alive[1].length && !alive[0].length
        ? 1
        : null;
  return {
    frames,
    winner,
    damage:
      winner === null
        ? 3
        : 2 +
          alive[winner].reduce(
            (n, f) => n + (isUndying(f) ? 0 : f.summon ? 1 : f.star),
            0,
          ),
  };
}

/** Full playback snapshots for the actual battle and saved replays. */
export function simulate(
  left: Piece[],
  right: Piece[],
  version: CombatVersion = CURRENT_COMBAT_VERSION,
): Battle {
  return runBattle(left, right, version, true);
}
/** Same combat rules without allocating every animation snapshot during AI search. */
export function simulateOutcome(
  left: Piece[],
  right: Piece[],
  version: CombatVersion = CURRENT_COMBAT_VERSION,
) {
  const battle = runBattle(left, right, version, false);
  return {
    winner: battle.winner,
    damage: battle.damage,
    final: battle.frames[0],
  };
}
