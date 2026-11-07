import { catalogCost, catalogUnit } from "../data/catalog";
import { unitArmor,unitAttackInterval,unitDefinition } from "../data/unit-stats";
import { CURRENT_COMBAT_VERSION, hasGospelRules, hasTortoiseRules } from "./types";
import { isInsect, insectCount, mergeCount, pieceCopies } from "./progression";
import { army, simulateOutcome } from "./battle";
import { usesEnergy } from "./triggers";
import { inGospelField } from "./gospel";
import { encounterFor, encounterArmy } from "../data/encounters";
import { profileFor, DIFFICULTIES, type AiProfile } from "../data/ai-profiles";
import {
  AXE_THROW,
  BLADE_STORM,
  BLADE_CRITICAL,
  SHIELD_WAVE,
  STAFF_GALE,
  TUSK_CHARGE,
  ACID_POLLUTION,
  DEATH_SONG,
  PANGOLIN_BURROW,
  SKILLS,
  BULWARK,
  SPIRIT_WARD,
  TORTOISE,
  EXECUTION,
  AURORA,
  ARHAT_QI,
  MOTOR_TAR,
  THUNDER_CHAIN,
  GOSPEL,
  THUNDERSTORM,
  JUNGLE,
  WUSHI,
  WUSHI_CONTROL,
  SHURIKEN,
  SECRET_ORB,
  BOMBARDMENT,
  TERMINATOR,
  WARCRY,
  TORNADO,
  WILDFIRE,
  BONEBLAST,
  THORNBIND,
  GAZE,
  HIVE,
} from "../data/skills";
import { RETINUE, SPIRIT_WOLF } from "./summons";
import { equipmentStats } from "../data/items";
import { UNIT, RULES } from "../data/units";
import { synergies } from "./synergies";
import { traitTiers } from "../data/traits";
import { availableUnits, type RecruitmentContext } from "./rotation";
import { previewPurchase, previewSale } from "./recruitment";
import { equipBot } from "./equipment";
import { completesOpening, openingCollection, openingCores } from "./opening-ai";
import type { CombatVersion, Difficulty, Game, Piece, Player } from "./types";

const CONTROL_SECONDS: Record<string, number> = {
  pangolin: PANGOLIN_BURROW.knockupTicks / 4,
  elephant: TUSK_CHARGE.knockupTicks / 4,
  axethrall: AXE_THROW.stunTicks / 4,
  irondog: 0.5,
  specialist: 0.75,
  guard: 1,
  cavalry: 0.5,
  bull: 1,
  eyebug: 1.5,
  bat: 1,
  vine: 1.5,
  bonedragon: 1,
  treant: 2,
};

/** Expected first-cast contribution, deliberately below perfect multi-target uptime.
 * This is a roster heuristic, never an extra combat bonus or a claim of win probability. */
export function abilityCredit(
  p: Piece,
  gear = equipmentStats(p.items),
  openingMana = 0,
): number {
  if(p.defId==="infantry")return 0;
  const u = unitDefinition(p.defId,p.definitionVersion),
    skill = SKILLS[p.defId];
  // Team healing, charging and retinues are already credited separately below.
  if (
    [
      "fish",
      "repair",
      "medic",
      "acolyte",
      "ironrooster",
      "wolf",
      "adept",
      "shark",
    ].includes(p.defId)
  )
    return 0;
  if (p.defId === "bladethrall")
    return BLADE_CRITICAL.chance * (BLADE_CRITICAL.multiplier[p.star - 1] - 1);
  // Expect only three stacks, not permanent maximum speed or the conditional 50 armor.
  if (p.defId === "staffthrall")
    return Math.min(0.45, STAFF_GALE.speedPerStack[p.star - 1] * 3);
  if (p.defId === "birdrider") return 1.2 / (8 - p.star); // Discount interruption; no mana or skill-power gain.
  if (p.defId === "thunderlord")
    // Ordinary attacks benefit from attack/haste/lifesteal, not spell power or mana gear.
    return Math.min(
      0.6,
      Array.from(
        { length: THUNDER_CHAIN.hits[p.star - 1] - 1 },
        (_, i) => THUNDER_CHAIN.retention ** (i + 1),
      ).reduce((a, b) => a + b, 0) * 0.7,
    );
  const passive = ["cavalry", "turtle", "tiger", "blastbug"].includes(p.defId)&&!(p.defId==="turtle"&&hasTortoiseRules(p.definitionVersion??CURRENT_COMBAT_VERSION));
  const initial = Math.min(
    100,
    (p.defId === "bomber" ? 50 : (u.initialMana ?? 0)) + gear.mana + openingMana,
  );
  const readiness = passive ? 1 : 0.65 + initial * 0.0035;
  const power = 1 + gear.skillPower;
  let attacks = skill.multiplier * (skill.radius > 0 ? 1.8 : 1);
  let utility = skill.shieldRatio * 0.25;
  utility +=
    (CONTROL_SECONDS[p.defId] ?? 0) * (skill.radius > 0 ? 1.8 : 1) * 0.035;
  switch (p.defId) {
    case "deer":
      attacks=0;utility=SPIRIT_WARD.armor[p.star-1]*0.003+SPIRIT_WARD.resist[p.star-1]*0.1;
      break;
    case "guard":
      // One short personal stance and partial adjacent redirection, without fictitious skill damage.
      attacks=0;utility=BULWARK.armor[p.star-1]*0.008+BULWARK.tauntDuration/4*0.035;
      break;
    case "wasp":
      attacks=(HIVE.innerDamage[p.star-1]+HIVE.outerDamage[p.star-1]*1.2)*0.75/(u.attack*2**(p.star-1));
      utility=0;
      break;
    case "eyebug":
      attacks=0;utility=GAZE.duration[p.star-1]/4*0.035+0.04;
      break;
    case "vine":
      // Credit two of three interruptible pulses and partial useful self-healing.
      attacks=THORNBIND.multiplier*2/3;
      utility=THORNBIND.root/4*2*0.035+attacks*u.attack/u.hp*0.25;
      break;
    case "bonedragon":
      // A delayed, dodgeable small circle; the long cooldown does not promise a second cast.
      attacks=BONEBLAST.multiplier*1.8*0.75;
      utility=BONEBLAST.stun/4*1.8*0.035*0.75;
      break;
    case "winddragon":
      // A dodgeable strip through a few units, not a target-centered circle or a full team.
      attacks=TORNADO.damage[p.star-1]*1.8*0.75/(u.attack*2**(p.star-1));
      utility=(TORNADO.flight+TORNADO.stun[p.star-1])/4*1.8*0.035*0.75;
      break;
    case "lion":
      // A partial cone and six received hits, never a guaranteed full 20s of damage.
      attacks=WARCRY.damage[p.star-1]*1.6*0.75/(u.attack*2**(p.star-1));
      utility=WARCRY.petrify[p.star-1]/4*1.6*0.035 +
        WARCRY.reflection[p.star-1]*6*1.25/(u.attack*2**(p.star-1))*0.04;
      break;
    case "monk":
      // A vulnerable maintained spell: credit four of seven hits on 1.6 targets.
      attacks=SECRET_ORB.damage[p.star-1]*4/7*1.6/(u.attack*2**(p.star-1));
      utility=SECRET_ORB.drain*4*1.6/100*0.12;
      break;
    case "panda":
      // A dodgeable fixed field: credit three of five pulses on 1.4 targets.
      attacks = SHURIKEN.damage[p.star - 1] * 3 * 1.4 / (u.attack * 2 ** (p.star - 1));
      break;
    case "stormcaller":
      // One or two contacts after a dodgeable windup; never assume the whole team lines up.
      attacks = THUNDERSTORM.damage[p.star - 1] * 1.5 * 0.7 / (u.attack * 2 ** (p.star - 1));
      utility += THUNDERSTORM.drain / 100 * 0.25;
      break;
    case "skycrab":
      attacks = AURORA.damage[p.star - 1] / (u.attack * 2 ** (p.star - 1));
      // Credit part of the first attack increase, never assume three casts in a short fight.
      utility += AURORA.attackPerStack * 0.35;
      break;
    case "pangolin":
      attacks =
        PANGOLIN_BURROW.damage[p.star - 1] / (u.attack * 2 ** (p.star - 1));
      break;
    case "lingjiu":
      // Close-range circle; allow partial coverage instead of assuming an entire backline.
      attacks =
        (DEATH_SONG.damage[p.star - 1] * 1.6) / (u.attack * 2 ** (p.star - 1));
      break;
    case "elephant":
      attacks = TUSK_CHARGE.damage[p.star - 1] / (u.attack * 2 ** (p.star - 1));
      break;
    case "venombeast":
      // Utility, not fictitious direct damage or guaranteed whole-team coverage.
      attacks = 0;
      utility += Math.min(0.28, ACID_POLLUTION.armor[p.star - 1] * 0.012) * 1.5;
      break;
    case "shieldthrall":
      attacks =
        (SHIELD_WAVE.damage[p.star - 1] * 2) / (u.attack * 2 ** (p.star - 1));
      utility += (SHIELD_WAVE.silenceTicks / 4) * 0.05 * 2;
      break;
    case "swordthrall":
      // Three pulses on two targets; do not assume six perfectly packed hits.
      attacks =
        (BLADE_STORM.damage[p.star - 1] * 3 * 2) /
        (u.attack * 2 ** (p.star - 1));
      utility += 0.08;
      break;
    case "axethrall":
      // Historical flat 300/500/700 progression, not per-star doubling.
      attacks = AXE_THROW.damage[p.star - 1] / (u.attack * 2 ** (p.star - 1));
      break;
    case "ironape":
      attacks = (250 * 1.5 * 0.75) / u.attack; // Nearby targets, with an interruption allowance.
      break;
    case "specialist":
      attacks = (300 / u.attack) * 0.75; // Aiming may be interrupted or lose its target.
      break;
    case "irondog":
      attacks = (70 * 2 * 1.5) / u.attack; // Two pulses on 1.5 nearby targets; allow interruption.
      break;
    case "motorcycle":
      // Discount the three-second warning, movement and interrupted later launches.
      attacks =
        ((MOTOR_TAR.damage[p.star - 1] * Math.min(2, p.star) +
          MOTOR_TAR.splash * 0.5) *
          0.7) /
        (u.attack * 2 ** (p.star - 1));
      break;
    case "reaper":
      return Math.min(0.38,0.12+(EXECUTION.damage[p.star-1]*power/(u.attack*2**(p.star-1)))*0.02+(p.star>=2?0.06:0))*readiness; // Discounted marks and one execution; no guaranteed kill or puppet.
    case "turtle":
      return hasTortoiseRules(p.definitionVersion??CURRENT_COMBAT_VERSION)
        ? Math.min(0.38,0.18+(TORTOISE.multiplier[p.star-1]-1)*0.06)*readiness
        : 0.12; // Old catalog keeps its decaying passive armor.
    case "bloodhawk":
      return 0.22 * readiness; // Heal/form cannot be amplified by skill power.
    case "skytoad":
      return (0.22 + 0.06 + Math.min(0.08, 0.04 * p.star)) * readiness; // Threshold execution plus some first-feast sustain/rage, not unlimited kills or skill-power scaling.
    case "spider":
      return Math.min(0.24, 0.08 + p.star * 0.04) * readiness;
    case "flametrooper":
      attacks = (skill.multiplier + 0.35 * 2) * 1.6;
      break;
    case "grenadier":
      utility += (1 + p.star) * 0.05;
      break;
    case "whale":
      // Credit three pulses on two targets of comparable HP, not ten hits on an entire team.
      attacks = (u.hp * (0.02 + p.star * 0.01) * 3 * 2) / u.attack;
      break;
    case "blastbug":
      attacks = (u.hp * 0.35 * 1.8) / u.attack;
      break;
    case "bomber":
    case "eel":
      attacks = skill.multiplier * 2 * 1.8;
      break; // Interrupted channels/targets walking away.
    case "phoenix":
      // Partial channel on two targets; never assume a whole team stays inside or an egg hatches.
      attacks = WILDFIRE.damage[p.star - 1] * 2 * 0.65 / (u.attack * 2 ** (p.star - 1));
      break;
    case "ark":
      // Credit one dodgeable pass on a few targets, not three packets per target or an entire team.
      attacks = BOMBARDMENT.damage[p.star - 1] * 1.8 * 0.75 / (u.attack * 2 ** (p.star - 1));
      break;
    case "titan":
      // A limited two-round area spell; no invented stun or guaranteed full-team hits.
      attacks = (TERMINATOR.smallDamage[p.star - 1] + TERMINATOR.largeDamage[p.star - 1]) *
        1.8 * 0.75 / (u.attack * 2 ** (p.star - 1));
      utility = 0;
      break;
    case "arhat":
      attacks =
        (ARHAT_QI.damage[p.star - 1] / (u.attack * 2 ** (p.star - 1))) * 0.75;
      break;
    case "bat":
      attacks = 0.4 * 3;
      break;
    case "tiger":
      attacks = Math.max(0, attacks - 1);
      break; // Replaces an ordinary attack.
    case "ghostjet":
      utility += 0.08;
      break;
    case "dragonfly":
      utility += 0.07;
      break;
    case "master":
      // A limited successful form, not an instant burst or permanent maximum armor.
      attacks = 0;
      utility = WUSHI.armor[p.star - 1] * 0.008 + 0.15 + WUSHI_CONTROL.tauntDuration / 4 * 0.025;
      break;
    case "treant":
      // A first wave on a few targets; do not credit a permanent shield or assume a second 30s cast.
      attacks = JUNGLE.damage[p.star - 1] * 2.2 * 0.75 / (u.attack * 2 ** (p.star - 1));
      utility = (JUNGLE.flight + JUNGLE.stun[p.star - 1]) / 4 * 2.2 * 0.035;
      break;
    case "vajra":
      utility += 0.05;
      break;
  }
  const damageWeight =
    p.defId !== "arhat" && skill.damageType === "true" ? 1.25 : 1;
  // Keep stars, permanent stats and completed synergies important. Extra gear never
  // turns a one-star specialist into a guaranteed replacement for a developed carry.
  return Math.min(
    0.6,
    (attacks * damageWeight * power * 0.04 + utility) * readiness,
  );
}
/** A bounded estimate for lineup selection; not an official or simulated combat rating. */
export function pieceStrength(p: Piece): number {
  return strengthWithOpening(p, 0);
}
/** Discounted protection for actual available allies; overlapping deer are not summed. */
export function wardSupportCredit(pieces:Piece[]){
  return Math.max(0,...pieces.filter(p=>p.defId==="deer").map(source=>{
    const gear=equipmentStats(source.items),readiness=0.65+Math.min(100,gear.mana)*0.0035;
    const allies=pieces.filter(p=>p.uid!==source.uid).map(pieceStrength).sort((a,b)=>b-a)
      .slice(0,SPIRIT_WARD.targets[source.star-1]).reduce((n,v)=>n+v,0);
    return Math.min(pieceStrength(source)*0.4,allies*(SPIRIT_WARD.armor[source.star-1]*0.002+SPIRIT_WARD.resist[source.star-1]*0.12)*0.55)*readiness;
  }));
}
function strengthWithOpening(p: Piece, openingMana: number): number {
  const u = unitDefinition(p.defId,p.definitionVersion),
    scale = 2 ** (p.star - 1),
    gear = equipmentStats(p.items);
  const summon =
    p.defId === "wolf"
      ? { ...SPIRIT_WOLF, count: 2 }
      : p.defId === "adept"
        ? RETINUE.puppet
        : p.defId === "shark"
          ? RETINUE.sentinel
          : null;
  // Credit part of a successful first summon; do not assume an unlimited army.
  const companion = summon
    ? 0.4 *
      summon.count *
      Math.sqrt((summon.hp * summon.attack) / summon.interval) *
      scale *
      (1 + gear.skillPower)
    : 0;
  return (
    Math.sqrt(
      ((u.hp * scale + gear.hp) * (u.attack * scale + gear.attack)) * (p.defId === "wasp" ? 2.5 : 1) /
        Math.max(p.defId === "wasp" ? HIVE.needlesPerAttack*HIVE.needleInterval : 1, unitAttackInterval(u,p.star) * (1 - gear.haste)),
    ) *
      (1 + (unitArmor(u, p.star) + gear.armor) * 0.025) *
      (p.defId === "phoenix" && p.star >= 2 ? 1.12 : 1) *
      (1 + abilityCredit(p, gear, openingMana)) +
    companion
  );
}
/** Opening protection for ranged allies, not a mandatory tank slot or win forecast.
 * Jumping assassins leave the line; unactivated flankers only provide partial cover.
 * Use permanent bodies/gear, not summons that still need to be cast and placed. */
export function frontlineFactor(
  pieces: Piece[],
  assassinsJump = false,
): number {
  if (pieces.length < 3) return 1;
  let front = 0,
    back = 0;
  let hasRanged = false;
  for (const p of pieces) {
    const u = unitDefinition(p.defId,p.definitionVersion),
      gear = equipmentStats(p.items);
    const durability =
      (u.hp * 2 ** (p.star - 1) + gear.hp) *
      (1 + Math.max(0, unitArmor(u, p.star) + gear.armor) * 0.06);
    const assassin = u.traits.includes("刺杀");
    // Bomber is deliberately placed on the front row despite its range of two.
    const frontRole =
      u.range === 1 || ["reaper","bomber", "flametrooper"].includes(u.id);
    hasRanged ||= !frontRole;
    if (assassin && assassinsJump) continue;
    if (!frontRole) back += durability;
    else front += durability * (assassin ? 0.35 : 1);
  }
  if (!hasRanged) return 0.94;
  if (!back) return 1;
  // A front body budget of half the ranged body budget gives full credit.
  // Missing protection costs at most the same 18% as the old all-ranged penalty.
  return 0.82 + 0.18 * Math.min(1, front / (back * 0.5));
}
export function lineupScore(pieces: Piece[], profile: AiProfile): number {
  const active = synergies(pieces.map((p, i) => ({ ...p, position: 32 + i })));
  const base = pieces.reduce((n, p) => n + strengthWithOpening(p, active.reduce(
    (mana, synergy) => mana + (unitDefinition(p.defId,p.definitionVersion).traits.includes(synergy.trait)
      ? synergy.bonus.mana ?? 0 : 0), 0,
  )), 0);
  const bonus = active.reduce((n, s) => n + s.tier * 0.075, 0);
  // A modest, bounded credit for nearby ally healing. Damage-based self-healing (wolf)
  // is deliberately excluded; it does not heal allies or scale from the caster's HP.
  const support = pieces.reduce((n, p) => {
    if (!["fish", "repair", "medic"].includes(p.defId))
      return n;
    const skill = SKILLS[p.defId],
      gear = equipmentStats(p.items);
    const hp = unitDefinition(p.defId,p.definitionVersion).hp * 2 ** (p.star - 1) + gear.hp;
    if (p.defId === "medic")
      return (
        n +
        Math.min(
          // At most two recipients and three of four pulses; allow skill gear
          // to matter before the cap, while bounding total credit below body value.
          pieceStrength(p) * 0.8,
          (50 + p.star * 25) *
            3 *
            (1 + gear.skillPower) *
            Math.min(2, pieces.length) *
            0.08,
        )
      );
    if (p.defId === "repair") {
      const carry = Math.max(
        0,
        ...pieces.filter((ally) => ally.uid !== p.uid).map(pieceStrength),
      );
      return (
        n +
        carry * ((15 + p.star * 10) / 100) * 0.45 +
        Math.min(
          pieceStrength(p) * 0.25,
          hp * 0.25 * (1 + gear.skillPower) * 0.08,
        )
      );
    }
    const recipients = Math.min(pieces.length, 3);
    return (
      n +
      Math.min(
        pieceStrength(p) * 0.15,
        hp * skill.healRatio * (1 + gear.skillPower) * recipients * 0.08,
      )
    );
  }, 0);
  // Energy support depends on allies that can actually cast. Count only the best
  // battery: duplicate acolytes must not inflate a lineup through mutual charging.
  const battery = pieces
    .filter((p) => p.defId === "acolyte")
    .sort((a, b) => b.star - a.star)[0];
  const energySupport = battery
    ? pieces
        .filter(
          (p) =>
            ![
              "acolyte",
              "cavalry",
              "turtle",
              "tiger",
              "blastbug",
              "birdrider",
              "bladethrall",
              "staffthrall",
              "thunderlord",
            ].includes(p.defId),
        )
        .sort((a, b) => pieceStrength(b) - pieceStrength(a))
        .reduce((n, p) => n + pieceStrength(p), 0) *
      // Four seconds of recovery, discounted for range, deaths and one-shot casters.
      // Only the strongest aura is credited; overlapping duplicates do not stack.
      ((GOSPEL.energy[battery.star - 1] * 4) / 100) *
      0.4
    : 0;
  const flyingShare =
    pieces.filter((p) => unitDefinition(p.defId,p.definitionVersion).flying).length /
    Math.max(1, pieces.length);
  const physicalShare = pieces.length
    ? pieces.filter((p) => !unitDefinition(p.defId,p.definitionVersion).traits.includes("陆行者")).length /
      pieces.length
    : 0;
  const teamBonus = active.reduce(
    (n, s) =>
      n +
      (s.bonus.teamAttack ?? 0) * 0.35 +
      (s.bonus.teamLifesteal ?? 0) * 0.3 +
      ((s.bonus.criticalChance ?? 0) *
        ((s.bonus.criticalMultiplier ?? 1) - 1) *
        0.35 *
        s.count) /
        Math.max(1, pieces.length) +
      (s.bonus.teamHaste ?? 0) * 0.35 +
      ((s.bonus.haste ?? 0) * 0.35 * s.count) / Math.max(1, pieces.length) +
      ((s.bonus.armor ?? 0) * 0.012 * s.count) / Math.max(1, pieces.length) +
      ((s.bonus.attack ?? 0) * 0.35 * s.count) / Math.max(1, pieces.length) +
      (s.bonus.evasion ?? 0) * flyingShare * 0.3 +
      (s.bonus.seaMana ?? 0) * flyingShare * 0.0025 +
      (s.bonus.seaWard ?? 0) * flyingShare * 0.3 +
      (s.bonus.airGroundBonus ?? 0) * flyingShare * 0.35 +
      (s.bonus.damageMana ?? 0) * 0.1 +
      (s.bonus.enemyManaPenalty ?? 0) * 0.01 +
      ((s.bonus.armorPenetration ?? 0) * 0.012 * s.count) /
        Math.max(1, pieces.length) +
      (s.bonus.siege ?? 0) * 0.2 +
      (s.bonus.enemyArmor ?? 0) * 0.012 * physicalShare +
      (s.bonus.reflection ?? 0) * 0.002 +
      ((s.bonus.groundBonus ?? 0) * 0.35 * s.count) /
        Math.max(1, pieces.length) +
      (s.bonus.trueAttack ? (0.1 * s.count) / Math.max(1, pieces.length) : 0) +
      ((s.bonus.immortal ?? 0) * 0.007 * s.count) / Math.max(1, pieces.length),
    0,
  );
  const preferred = pieces.reduce(
    (n, p) =>
      n +
      unitDefinition(p.defId,p.definitionVersion).traits.filter((t) => profile.traits.includes(t)).length * 8,
    0,
  );
  const coordinator = pieces
    .filter((p) => p.defId === "ironrooster")
    .sort((a, b) => b.star - a.star)[0];
  const coordination = coordinator
    ? pieces
        .map(pieceStrength)
        .sort((a, b) => b - a)
        .slice(0, 3)
        .reduce((n, power) => n + power, 0) *
      Math.min(
        0.18,
        (0.05 + coordinator.star * 0.1) * 0.3 +
          (1 + coordinator.star * 2) * 0.012,
      )
    : 0;
  const armorRegen = active.find((s) => s.trait === "装甲")?.bonus.regen ?? 0;
  const sustain = pieces.reduce((value, p) => {
    if (!unitDefinition(p.defId,p.definitionVersion).traits.includes("装甲")) return value;
    const hp =
      unitDefinition(p.defId,p.definitionVersion).hp * 2 ** (p.star - 1) + equipmentStats(p.items).hp;
    // Credit at most six damaged seconds, capped at 20% of body value.
    return (
      value + pieceStrength(p) * Math.min(0.2, ((armorRegen * 24) / hp) * 0.5)
    );
  }, 0);
  const mixed = frontlineFactor(
    pieces,
    pieces.some((p) => unitDefinition(p.defId,p.definitionVersion).traits.includes("刺杀")),
  );
  return (
    (base * (1 + bonus + teamBonus) +
      support +
      wardSupportCredit(pieces) +
      energySupport +
      coordination +
      sustain +
      preferred) *
    mixed
  );
}
function fillOwnedCore(p: Player, core: Piece[]): Piece[] {
  const candidate = [...core], size = Math.min(p.level, p.pieces.length), profile = profileFor(p);
  while (candidate.length < size) {
    const next = p.pieces
      .filter((piece) => !candidate.some((chosen) => chosen.uid === piece.uid))
      .map((piece) => ({ piece, score: lineupScore([...candidate, piece], profile) }))
      .sort((a, b) => b.score - a.score || a.piece.uid - b.piece.uid)[0];
    if (!next) break;
    candidate.push(next.piece);
  }
  return candidate;
}
function openingLineups(p: Player, version: CombatVersion) {
  return openingCores(p, version, pieceStrength).map((core) => fillOwnedCore(p, core));
}
/** Bounded combination search; never duplicates pieces or exceeds population. */
function candidateLineups(p: Player, difficulty: Difficulty): Piece[][] {
  const profile = profileFor(p),
    all = [...p.pieces].sort((a, b) => a.uid - b.uid),
    size = Math.min(p.level, all.length),
    width = DIFFICULTIES[difficulty].beam;
  // Beginner opponents choose individual strength, without searching trait combinations.
  if (difficulty === "relaxed")
    return [
      [...all]
        .sort((a, b) => pieceStrength(b) - pieceStrength(a) || a.uid - b.uid)
        .slice(0, size),
    ];
  let states: { indices: number[]; score: number }[] = [
    { indices: [], score: 0 },
  ];
  for (let depth = 0; depth < size; depth++) {
    const next: typeof states = [];
    for (const state of states)
      for (
        let i = (state.indices.at(-1) ?? -1) + 1;
        i <= all.length - (size - depth);
        i++
      ) {
        const indices = [...state.indices, i];
        next.push({
          indices,
          score: lineupScore(
            indices.map((j) => all[j]),
            profile,
          ),
        });
      }
    states = next
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.indices.join(",").localeCompare(b.indices.join(",")),
      )
      .slice(0, width);
  }
  const drafts = states.map((state) => state.indices.map((i) => all[i]));
  // Beam search can prune individually weak pieces before their completed trait pays off.
  // Seed attainable profile tiers explicitly, then fill remaining slots by marginal team value.
  const strongest = [...all]
    .sort((a, b) => pieceStrength(b) - pieceStrength(a) || a.uid - b.uid)
    .filter(
      (piece, index, sorted) =>
        sorted.findIndex((other) => other.defId === piece.defId) === index,
    );
  const cores: Piece[][] = [];
  for (const synergy of synergies(
    strongest.map((piece, index) => ({ ...piece, position: 32 + index })),
  )) {
    if (profile.traits.length && !profile.traits.includes(synergy.trait))
      continue;
    const members = strongest.filter((piece) =>
      unitDefinition(piece.defId,piece.definitionVersion).traits.includes(synergy.trait),
    );
    for (const count of synergy.tiers)
      if (count <= size && members.length >= count)
        cores.push(members.slice(0, count));
  }
  const singles = profile.traits.length ? [...cores] : [];
  for (let i = 0; i < singles.length; i++)
    for (let j = i + 1; j < singles.length; j++) {
      const combined = [...new Set([...singles[i], ...singles[j]])];
      if (combined.length <= size) cores.push(combined);
    }
  const key = (pieces: Piece[]) =>
    pieces
      .map((piece) => piece.uid)
      .sort((a, b) => a - b)
      .join(",");
  const seen = new Set<string>();
  for (const core of cores) {
    const signature = key(core);
    if (seen.has(signature)) continue;
    seen.add(signature);
    const candidate = [...core];
    while (candidate.length < size) {
      const next = all
        .filter((piece) => !candidate.includes(piece))
        .map((piece) => ({
          piece,
          score: lineupScore([...candidate, piece], profile),
        }))
        .sort((a, b) => b.score - a.score || a.piece.uid - b.piece.uid)[0];
      if (!next) break;
      candidate.push(next.piece);
    }
    drafts.push(candidate);
  }
  const unique = new Map(
    drafts.map((pieces) => [
      key(pieces),
      { pieces, score: lineupScore(pieces, profile) },
    ]),
  );
  return [...unique.entries()]
    .sort(([a, x], [b, y]) => y.score - x.score || a.localeCompare(b))
    .slice(0, width)
    .map(([, entry]) => entry.pieces);
}
export function chooseLineup(p: Player, difficulty: Difficulty): Piece[] {
  return candidateLineups(p, difficulty)[0] ?? [];
}
export function deployLineup(
  p: Player,
  difficulty: Difficulty,
  formation: "spread" | "compact" = "spread",
  version: CombatVersion = CURRENT_COMBAT_VERSION,
) {
  placeLineup(p, chooseLineup(p, difficulty), formation === "compact", version);
}
function placeLineup(
  p: Player,
  best: Piece[],
  compact = false,
  version: CombatVersion = CURRENT_COMBAT_VERSION,
) {
  const used = new Set<number>();
  for (const piece of p.pieces) piece.position = null;
  for (const piece of best.sort(
    (a, b) => pieceStrength(b) - pieceStrength(a) || a.uid - b.uid,
  )) {
    const u = unitDefinition(piece.defId,piece.definitionVersion);
    const positions = ["bomber", "flametrooper"].includes(u.id)
      ? [35, 36, 34, 37, 43, 44, 42, 45, 33, 38]
      : compact
        ? u.range > 1
          ? [63, 62, 55, 61, 54, 60, 53, 59, 52, 58]
          : [47, 46, 53, 45, 52, 44, 51, 43, 50, 42]
        : ["fish", "deer", "repair", "medic"].includes(u.id)
          ? [43, 44, 42, 45, 51, 52, 50, 53, 49, 54]
          : u.range > 1
            ? [56, 63, 59, 61, 57, 62, 58, 60, 48, 55]
            : u.id === "monk"
              ? [43, 44, 42, 45, 35, 36, 34, 37]
              : u.traits.includes("刺杀")
                ? [32, 39, 33, 38, 40, 47, 35, 36]
                : [35, 36, 34, 37, 33, 38, 32, 39, 43, 44];
    piece.position =
      positions.find((pos) => !used.has(pos)) ??
      Array.from({ length: 32 }, (_, i) => i + 32).find(
        (pos) => !used.has(pos),
      )!;
    used.add(piece.position);
  }
  if (hasGospelRules(version)) placeGospelFields(best, used, version);
}
/** Keep batteries behind the front row and near allies that need first-cast energy. */
function placeGospelFields(
  pieces: Piece[],
  used: Set<number>,
  version: CombatVersion,
) {
  const sources = pieces.filter((piece) => piece.defId === "acolyte")
    .sort((a, b) => b.star - a.star || a.uid - b.uid);
  if (!sources.length) return;
  const fighters = army(pieces, 0, version);
  const recipients = fighters.filter((f) => usesEnergy(f) && f.mana < 100);
  const weights = new Map(recipients.map((f) => [
    f.uid,
    pieceStrength(pieces.find((piece) => piece.uid === f.uid)!) * (100 - f.mana) / 100,
  ]));
  const covered = new Set<number>();
  const point = (position: number) => ({ x: position % 8, y: Math.floor(position / 8) });
  // Back-row ties are deterministic; only improve coverage, never displace another unit.
  const positions = Array.from({ length: 24 }, (_, i) => i + 40).sort((a, b) =>
    Math.floor(b / 8) - Math.floor(a / 8) ||
    Math.abs(a % 8 - 3.5) - Math.abs(b % 8 - 3.5) || a - b,
  );
  for (const source of sources) {
    const coverage = (position: number) => recipients.reduce((score, target) =>
      score + (!covered.has(target.uid) && inGospelField(point(position), target)
        ? weights.get(target.uid)! : 0), 0);
    let bestPosition = source.position!, bestScore = coverage(bestPosition);
    for (const position of positions) {
      if (used.has(position) && position !== source.position) continue;
      const score = coverage(position);
      if (score > bestScore + 1e-9) {
        bestPosition = position;
        bestScore = score;
      }
    }
    used.delete(source.position!);
    source.position = bestPosition;
    used.add(bestPosition);
    for (const target of recipients)
      if (inGospelField(point(bestPosition), target)) covered.add(target.uid);
  }
}
/** Visible armies only: no future shops, secret bonuses or free economy actions. */
function publicOpponent(g: Game, p: Player) {
  const encounter = encounterFor(g);
  if (encounter) return {id:-1,name:encounter.name,kind:"pve" as const,pieces:encounterArmy(encounter)};
  const alive = g.players.filter((other) => other.hp > 0);
  if (alive.length < 2) return null;
  const other = alive[
    (alive.indexOf(p) + 1 + ((g.round - 1) % (alive.length - 1))) % alive.length
  ];
  return {id:other.id,name:other.name,kind:"pvp" as const,pieces:other.pieces};
}
export function tacticalOpponent(g: Game, p: Player): Piece[] {
  return publicOpponent(g,p)?.pieces ?? [];
}
function tacticalTrial(
  pieces: Piece[],
  opponent: Piece[],
  version: CombatVersion = CURRENT_COMBAT_VERSION,
) {
  const battle = simulateOutcome(pieces, opponent, version),
    last = battle.final;
  const health = (side: number) => {
    const team = last.fighters.filter((f) => (f.homeSide ?? f.side) === side);
    return (
      team.reduce((n, f) => n + Math.max(0, f.hp) / f.maxHp, 0) /
      Math.max(1, team.length)
    );
  };
  const score = (
    (battle.winner === 0 ? 10000 : battle.winner === null ? 0 : -10000) +
    (health(0) - health(1)) * 1000 +
    (battle.winner === 0 ? -1 : 1) * last.tick * 0.01
  );
  return {score,winner:battle.winner};
}
export function tacticalScore(pieces: Piece[], opponent: Piece[], version: CombatVersion = CURRENT_COMBAT_VERSION) {
  return tacticalTrial(pieces,opponent,version).score;
}
export interface TacticalOptions {
  maximumTrials?: number;
  /** AI equips its inventory after deployment. Player recommendations retain all gear. */
  equipInventory?: boolean;
}
export interface TacticalPlan {
  positions: {uid:number;position:number|null}[];
  trials: number;
  score: number;
  winner: 0 | 1 | null;
  opponent: {id:number;name:string;kind:"pvp"|"pve"};
}
const trialLimit = (value:number,maximum:number) => Number.isFinite(value)
  ? Math.max(0,Math.min(maximum,Math.floor(value))) : 0;
function expensiveController(g:Game,p:Piece) {
  return catalogCost(g,p.defId)>=4 && (CONTROL_SECONDS[p.defId]??0)>0;
}
function tryLineup(g:Game,p:Player,candidate:Piece[],compact:boolean|null,opponent:Piece[],equipInventory:boolean) {
  const preview=structuredClone(p),ids=new Set(candidate.map(piece=>piece.uid));
  if(compact!==null)
    placeLineup(preview,preview.pieces.filter(piece=>ids.has(piece.uid)),compact,g.combatVersion);
  if(equipInventory)equipBot(g,preview);
  return {...tacticalTrial(preview.pieces,opponent,g.combatVersion),
    positions:preview.pieces.map(({uid,position})=>({uid,position}))};
}
/** Read-only, bounded trials against the currently public army. No future trades,
 * random draws or opponent preparation are simulated. */
export function planTactically(g: Game, p: Player, options:TacticalOptions={}):TacticalPlan|null {
  const limit=trialLimit(options.maximumTrials??20,20);
  if (g.phase !== "prepare" || g.reward || p.hp <= 0 || !p.pieces.length || !limit) return null;
  const opponent=publicOpponent(g,p);
  if (!opponent?.pieces.some(piece=>piece.position!==null)) return null;
  const baseline=chooseLineup(p,g.difficulty==="relaxed"?"standard":g.difficulty);
  // Preserve complete opening cores even when the static beam ranks them poorly.
  const candidates=[baseline,...openingLineups(p,g.combatVersion),...candidateLineups(p,"veteran").slice(0,3)];
  const seen=new Set<string>();
  const unique=candidates.filter(candidate=>{
    const key=candidate.map(piece=>piece.uid).sort((a,b)=>a-b).join(",");
    if(seen.has(key))return false;seen.add(key);return true;
  });
  const board=baseline,selected=new Set(board.map(piece=>piece.uid));
  const controllers=p.pieces.filter(piece=>!selected.has(piece.uid)&&expensiveController(g,piece))
    .sort((a,b)=>pieceStrength(b)-pieceStrength(a)||a.uid-b.uid)
    .filter((piece,index,all)=>all.findIndex(other=>other.defId===piece.defId)===index);
  const replacements=controllers.flatMap(control=>board.map(old=>
    board.map(piece=>piece.uid===old.uid?control:piece)));
  let trials=0,best:ReturnType<typeof tryLineup>|null=null;
  const evaluate=(candidate:Piece[],compact:boolean|null)=>{
    if(trials>=limit)return null;
    const trial=tryLineup(g,p,candidate,compact,opponent.pieces,options.equipInventory??true);
    trials++;
    if(!best||trial.score>best.score)best=trial;
    return trial;
  };
  const current=p.pieces.filter(piece=>piece.position!==null);
  if(current.length>0&&current.length<=p.level&&p.pieces.length-current.length<=RULES.bench&&
    new Set(current.map(piece=>piece.position)).size===current.length&&
    current.every(piece=>Number.isInteger(piece.position)&&piece.position!>=32&&piece.position!<64))
    evaluate(current,null);
  for(const candidate of unique)
    for(const compact of [false,true])evaluate(candidate,compact);
  const alternatives:{candidate:Piece[];score:number}[]=[];
  for(const candidate of replacements){
    const trial=evaluate(candidate,false);
    if(!trial)break;
    alternatives.push({candidate,score:trial.score});
  }
  for(const alternative of alternatives.sort((a,b)=>b.score-a.score).slice(0,2))
    evaluate(alternative.candidate,true);
  if(!best)return null;
  const result=best as ReturnType<typeof tryLineup>;
  return {...result,trials,opponent:{id:opponent.id,name:opponent.name,kind:opponent.kind}};
}
export function deployTactically(g: Game, p: Player, options:TacticalOptions={}) {
  const plan=planTactically(g,p,options);
  if(plan){
    const positions=new Map(plan.positions.map(piece=>[piece.uid,piece.position]));
    for(const piece of p.pieces)piece.position=positions.get(piece.uid)??null;
  }
  return plan;
}
/** A real offer projected with shared quotes. Controllers need a win; a completed
 * opening core may also rescue a loss into a draw. Spending still stays in buy(). */
export function scoutControlPurchase(g:Game,p:Player,index:number,maximumTrials=40,targets:ReadonlySet<string>=new Set()) {
  const limit=trialLimit(maximumTrials,40),id=p.shop[index];
  const empty={improves:false,trials:0,baseline:null as number|null,best:null as number|null,sellUid:null as number|null};
  if(g.phase!=="prepare"||p.hp<=0||!id||!UNIT[id]||limit<3)return empty;
  const opening=completesOpening(p,id,g,g.combatVersion);
  if(!opening&&(g.round<12||p.level<6||
    !expensiveController(g,{uid:-1,defId:id,star:1,position:null})))return empty;
  const initial=previewPurchase(g,p,index);
  if(!initial.after||p.gold<initial.cost||initial.upgrades.length)return empty;
  let owner=p,pool=g.pool,sellUid:number|null=null;
  if(!initial.allowed){
    if(initial.benchAfter<=RULES.bench)return empty;
    const protectedTargets=new Set([...targets,id]);
    const incoming:Piece={uid:g.nextUid,defId:id,star:1,position:null};
    const coreIds=new Set(openingCores({...p,pieces:[...p.pieces,incoming]},g.combatVersion,pieceStrength)
      .filter(core=>core.some(piece=>piece.defId===id)).flatMap(core=>core.map(piece=>piece.defId)));
    const reserve=p.pieces.filter(piece=>piece.position===null&&piece.defId!==id)
      .filter(piece=>!opening||!coreIds.has(piece.defId)||
        p.pieces.some(other=>other.uid!==piece.uid&&other.defId===piece.defId))
      .sort((a,b)=>reservePriority(p,a,g.combatVersion,g,protectedTargets)-
        reservePriority(p,b,g.combatVersion,g,protectedTargets)||a.uid-b.uid)[0];
    if(!reserve||(!opening&&reservePriority(p,incoming,g.combatVersion,g,protectedTargets)<=
      reservePriority(p,reserve,g.combatVersion,g,protectedTargets)+4))return empty;
    const sale=previewSale(g,p,reserve.uid)!;
    owner=sale.after;pool={...g.pool,[sale.defId]:g.pool[sale.defId]+sale.copies};sellUid=reserve.uid;
  }
  const baseGame={...g,pool,players:g.players.map(player=>player===p?owner:player)};
  const quote=previewPurchase(baseGame,owner,index);
  if(!quote.allowed||!quote.after)return empty;
  const baseline=planTactically(g,p,{maximumTrials:Math.min(20,limit-1),equipInventory:true});
  if(!baseline)return empty;
  let trials=baseline.trials;
  if(baseline.winner===0)return {...empty,trials,baseline:baseline.score};
  const projected={...baseGame,nextUid:g.nextUid+1,players:baseGame.players.map(player=>player===owner?quote.after!:player)};
  const after=planTactically(projected,quote.after,{maximumTrials:limit-trials,equipInventory:true});
  trials+=after?.trials??0;
  const improves=after?.winner===0 || !!(opening&&baseline.winner===1&&
    after&&after.winner===null&&after.score>baseline.score);
  return {improves,trials,baseline:baseline.score,best:after?.score??null,sellUid};
}
export function savingsTarget(g: Game, p: Player): number {
  if (p.hp <= 35 || g.round >= 25) return 0;
  if (g.round <= 3) return 0;
  const base = Math.max(
    0,
    (g.round < 8 ? 10 : g.round < 15 ? 20 : 30) + profileFor(p).reserve,
  );
  if (p.hp <= 55) return Math.min(10, base);
  return p.streak <= -3 ? Math.max(0, base - 10) : base;
}
/** A collection plan is limited by this match's bans and the next population slot.
 * It influences paid decisions only; deployment still compares actual lineup strength. */
function puppetCollection(
  p: Player,
  context: RecruitmentContext,
  version: CombatVersion,
) {
  if (profileFor(p).id !== "puppets") return null;
  const kinds = new Set(
    p.pieces
      .filter((piece) => unitDefinition(piece.defId,piece.definitionVersion).traits.includes("傀儡"))
      .map((piece) => piece.defId),
  );
  const available = availableUnits(context).filter((unit) =>
    unit.traits.includes("傀儡"),
  ).length;
  const target =
    traitTiers(version)
      .傀儡.filter((tier) => tier.count <= Math.min(p.level + 1, available))
      .at(-1)?.count ?? 0;
  return { kinds, target };
}
/** Value a held copy, not the desire to BUY another. Merged pieces and upgrade pairs
 * must not become expendable merely because merging removed their one-star copies. */
export function reservePriority(
  p: Player,
  piece: Piece,
  version: CombatVersion = CURRENT_COMBAT_VERSION,
  context: RecruitmentContext = {},
  targets?: ReadonlySet<string>,
): number {
  const unit = catalogUnit({ ...context, combatVersion: version }, piece.defId),
    profile = profileFor(p);
  const partners = p.pieces.filter(
    (other) =>
      other.uid !== piece.uid &&
      other.defId === piece.defId &&
      other.star === piece.star,
  ).length;
  const needed = mergeCount(p.pieces, piece.defId, piece.star, version);
  // A loose copy still advances a three-star core after its earlier copies merged.
  // Count star-two bodies, not pool copies: insect bodies can contain two or three.
  const seconds = p.pieces.filter(
    (other) =>
      other.uid !== piece.uid &&
      other.defId === piece.defId &&
      other.star === 2,
  ).length;
  const third = mergeCount(p.pieces, piece.defId, 2, version);
  const progress = piece.star === 1 ? Math.min(seconds, third - 1) * 8 : 0;
  const distinct = new Set(p.pieces.map((other) => other.defId));
  const links = unit.traits.filter(
    (trait) =>
      profile.traits.includes(trait) &&
      [...distinct].some(
        (id) => id !== piece.defId && catalogUnit(context,id).traits.includes(trait),
      ),
  ).length;
  const collection = puppetCollection(p, context, version);
  const opening = openingCollection(p, context, version);
  const lastOpening = opening && unit.traits.includes(opening.trait) &&
    opening.kinds.size + Number(!opening.kinds.has(piece.defId)) <= opening.target &&
    !p.pieces.some(other=>other.uid!==piece.uid&&other.defId===piece.defId);
  const lastCore =
    collection &&
    unit.traits.includes("傀儡") &&
    collection.kinds.size + Number(!collection.kinds.has(piece.defId)) <=
      collection.target &&
    !p.pieces.some(
      (other) => other.uid !== piece.uid && other.defId === piece.defId,
    );
  return (
    pieceStrength(piece) * 0.06 +
    unit.cost * pieceCopies(piece) +
    unit.traits.filter((trait) => profile.traits.includes(trait)).length * 5 +
    Math.min(partners, needed - 1) * 8 * piece.star +
    progress +
    (piece.star === 1 && targets?.has(piece.defId) ? 18 : 0) +
    links * 6 +
    (lastCore ? 12 : 0) +
    (lastOpening ? 12 : 0)
  );
}
interface BotActions {
  buy(g: Game, p: Player, index: number): boolean;
  sell(g: Game, p: Player, uid: number): boolean;
  roll(g: Game, p: Player): boolean;
  buyXp(g: Game, p: Player): boolean;
}

/** Briefly keep useful low-cost cores at their current shop odds. Natural XP still
 * advances; low HP and the final eight rounds always release the population plan. */
function closeToThreeStars(g: Game, p: Player): boolean {
  if (p.level < 8 || p.hp <= 55 || g.round >= 23) return false;
  return p.pieces.some((piece) => {
    if (
      piece.position === null ||
      piece.star !== 2 ||
      catalogCost(g, piece.defId) > 3
    )
      return false;
    const same = p.pieces.filter((other) => other.defId === piece.defId);
    if (same.some((other) => other.star === 3)) return false;
    const first = mergeCount(p.pieces, piece.defId, 1, g.combatVersion);
    const second = mergeCount(p.pieces, piece.defId, 2, g.combatVersion);
    const remaining =
      (second - same.filter((other) => other.star === 2).length) * first -
      same.filter((other) => other.star === 1).length;
    return remaining > 0 && remaining <= first;
  });
}

/** Compare public unit data with the opening lineup, never future shop draws.
 * Two unfinished expensive kinds leave room for ordinary pairs and three-star cores. */
function recruitmentPlan(g: Game, p: Player) {
  const board = p.pieces.filter((piece) => piece.position !== null);
  if (board.length < 6) return null;
  const profile = profileFor(p),
    baseline = lineupScore(board, profile);
  const immediate = new Map<string, number>(),
    mature = new Map<string, number>();
  const replacementGain = (piece: Piece) =>
    board.length < p.level
      ? lineupScore([...board, piece], profile) - baseline
      : Math.max(
          ...board.map(
            (old) =>
              lineupScore(
                board.map((ally) => (ally.uid === old.uid ? piece : ally)),
                profile,
              ) - baseline,
          ),
        );
  for (const unit of availableUnits(g).filter((unit) => unit.cost >= 4)) {
    immediate.set(
      unit.id,
      replacementGain({ uid: -1, defId: unit.id, star: 1, position: null }),
    );
    const same = p.pieces.filter((piece) => piece.defId === unit.id);
    if (same.some((piece) => piece.star >= 2)) continue;
    const items = [...same]
      .sort(
        (a, b) =>
          Number(a.position === null) - Number(b.position === null) ||
          a.uid - b.uid,
      )
      .flatMap((piece) => piece.items ?? [])
      .slice(0, 3);
    const upgraded: Piece = {
      uid: -1,
      defId: unit.id,
      star: 2,
      position: null,
      items,
    };
    let gain: number;
    if (same.some((piece) => piece.position !== null)) {
      // Merging fielded duplicates frees slots: fill only with actually held bodies.
      const future = [
        ...board.filter((piece) => piece.defId !== unit.id),
        upgraded,
      ];
      const reserves = p.pieces.filter(
        (piece) => piece.position === null && piece.defId !== unit.id,
      );
      while (future.length < board.length && reserves.length) {
        reserves.sort(
          (a, b) =>
            lineupScore([...future, b], profile) -
              lineupScore([...future, a], profile) || a.uid - b.uid,
        );
        future.push(reserves.shift()!);
      }
      gain = lineupScore(future, profile) - baseline;
    } else gain = replacementGain(upgraded);
    if (gain > baseline * 0.02) mature.set(unit.id, gain / baseline);
  }
  return {
    immediate: (id: string) => (immediate.get(id) ?? 0) > baseline * 0.01,
    targets: () => {
      const ids = new Set([
        ...p.pieces.map((piece) => piece.defId),
        ...p.shop.filter((id): id is string => id !== null),
      ]);
      return new Set(
        [...ids]
          .filter(
            (id) =>
              mature.has(id) &&
              !p.pieces.some((piece) => piece.defId === id && piece.star >= 2),
          )
          .map((id) => ({
            id,
            score:
              Math.min(
                2,
                p.pieces.filter((piece) => piece.defId === id).length,
              ) *
                20 +
              Math.min(12, mature.get(id)! * 100),
          }))
          .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
          .slice(0, 2)
          .map((target) => target.id),
      );
    },
  };
}

export function prepareBot(g: Game, p: Player, actions: BotActions) {
  if (g.phase !== "prepare" || p.hp <= 0 || p.id === 0) return;
  const profile = profileFor(p),
    settings = DIFFICULTIES[g.difficulty],
    reserve = savingsTarget(g, p);
  deployLineup(p, g.difficulty, "spread", g.combatVersion);
  const plan = recruitmentPlan(g, p);
  let controlPurchaseTrials=0;
  const scoutCache=new Map<string,ReturnType<typeof scoutControlPurchase>>(),scoutApproved=new Set<string>(),
    scoutSales=new Map<string,number>(),scoutBought:string[]=[];
  const buyOffered=(index:number)=>{
    const id=p.shop[index],ok=actions.buy(g,p,index);
    if(ok&&id&&scoutApproved.has(id)&&!scoutBought.includes(id))scoutBought.push(id);
    return ok;
  };
  let targets = new Set<string>();
  const desire = (id: string) => {
    const u = catalogUnit(g, id),
      same = p.pieces.filter((x) => x.defId === id);
    if (same.some((x) => x.star === 3)) return -100;
    const pair = same.filter((x) => x.star === 1).length;
    const evolution =
      isInsect(id) && insectCount(p.pieces) > 0 && !same.length ? 4 : 0;
    const fit = u.traits.filter((t) => profile.traits.includes(t)).length;
    const existing = new Set(p.pieces.map((x) => x.defId));
    const link = existing.has(id)
      ? 0
      : u.traits.filter((t) =>
          p.pieces.some((x) => unitDefinition(x.defId,x.definitionVersion).traits.includes(t)),
        ).length;
    const collection = puppetCollection(p, g, g.combatVersion);
    const newCore =
      collection &&
      u.traits.includes("傀儡") &&
      !same.length &&
      collection.kinds.size < collection.target;
    return (
      u.cost +
      evolution +
      pair * 5 +
      (targets.has(id) ? 12 : 0) +
      same.filter((x) => x.star === 2).length * 3 +
      fit * 3 +
      link * 2 +
      (completesOpening(p,id,g,g.combatVersion) ? 12 : 0) +
      (newCore ? (collection.kinds.size === collection.target - 1 ? 10 : 6) : 0)
    );
  };
  const buyShop = (): void => {
    const offersBefore = p.shop.filter(id=>id!==null).length;
    targets = plan?.targets() ?? new Set();
    for (const index of p.shop
      .map((_, i) => i)
      .sort(
        (a, b) =>
          desire(p.shop[b] ?? "guard") - desire(p.shop[a] ?? "guard") || a - b,
      )) {
      const id = p.shop[index];
      if (!id) continue;
      const quote = previewPurchase(g, p, index);
      if (!quote.after) continue; // Includes banned offers; never sell to fund one.
      const score = desire(id),
        upgrade = quote.upgrades.length > 0,
        needsBodies = p.pieces.length < p.level;
      const collection = puppetCollection(p, g, g.combatVersion);
      const newCore =
        collection &&
        UNIT[id].traits.includes("傀儡") &&
        !collection.kinds.has(id) &&
        collection.kinds.size < collection.target;
      const completesCore =
        newCore &&
        collection.target <= p.level &&
        collection.kinds.size === collection.target - 1;
      const opening = completesOpening(p,id,g,g.combatVersion);
      if ((score < 3 && !needsBodies) || score < 0) continue;
      if (
        !upgrade &&
        !needsBodies &&
        (opening || (plan && catalogCost(g,id)>=4 && !newCore &&
          !p.pieces.some(piece=>piece.defId===id&&piece.star>=2) &&
          !targets.has(id) && !plan.immediate(id)))
      ) {
        if(g.difficulty==="relaxed"||scoutApproved.size||
          (!opening&&p.gold-catalogCost(g,id)<reserve))
          continue;
        const key=JSON.stringify([id,g.nextUid,p.level,p.pieces,p.inventory]);
        if(!scoutCache.has(key)){
          const probe=scoutControlPurchase(g,p,index,40-controlPurchaseTrials,targets);
          controlPurchaseTrials+=probe.trials;
          scoutCache.set(key,probe);
        }
        const probe=scoutCache.get(key)!;
        if(!probe.improves)continue;
        scoutApproved.add(id);
        if(probe.sellUid!==null)scoutSales.set(id,probe.sellUid);
      }
      if (
        !upgrade &&
        !needsBodies &&
        !completesCore &&
        !(opening&&scoutApproved.has(id)) &&
        p.gold - catalogCost(g, id) < reserve
      )
        continue;
      if (p.gold < catalogCost(g, id)) continue;
      // The shared quote includes cross-species insect merges and chain upgrades.
      if (quote.allowed) {
        buyOffered(index);
        continue;
      }
      if (p.pieces.filter((x) => x.position === null).length < RULES.bench)
        continue;
      const incoming: Piece = {
        uid: g.nextUid,
        defId: id,
        star: 1,
        position: null,
      };
      const transactionTargets=new Set([...targets,...scoutApproved]);
      const value = reservePriority(p, incoming, g.combatVersion, g, transactionTargets);
      const expendable = scoutSales.has(id)?p.pieces.find(piece=>piece.uid===scoutSales.get(id)):p.pieces
        .filter((x) => x.position === null && x.defId !== id)
        .filter(
          (piece) =>
            !newCore ||
            !collection.kinds.has(piece.defId) ||
            p.pieces.some(
              (other) => other.uid !== piece.uid && other.defId === piece.defId,
            ),
        )
        .sort(
          (a, b) =>
            reservePriority(p, a, g.combatVersion, g, transactionTargets) -
              reservePriority(p, b, g.combatVersion, g, transactionTargets) ||
            a.uid - b.uid,
        )[0];
      if (
        expendable &&
        ((opening&&scoutApproved.has(id)) || value >
          reservePriority(p, expendable, g.combatVersion, g, transactionTargets) + 4) &&
        actions.sell(g, p, expendable.uid)
      )
        buyOffered(index);
    }
    // An earlier offer can become useful after buying a missing member later in
    // this shop. Every retry requires a consumed offer, so there are at most five.
    if(p.shop.filter(id=>id!==null).length<offersBefore &&
      p.shop.some(id=>id!==null&&completesOpening(p,id,g,g.combatVersion)))buyShop();
  };
  buyShop();
  const target = Math.min(
    10,
    3 + Math.floor(Math.max(0, g.round - settings.levelDelay) / 3),
  );
  const chaseStars = closeToThreeStars(g, p);
  for (
    let i = 0;
    i < settings.xpPurchases &&
    p.level < target &&
    !chaseStars &&
    p.pieces.length >= p.level &&
    p.gold >= reserve + 5;
    i++
  ) {
    if (!actions.buyXp(g, p)) break;
  }
  // Match growing late income with a bounded paid search, keeping the existing
  // reserve and the easy difficulty's one-roll identity. No pool/RNG lookahead.
  const extraRolls =
    g.difficulty !== "relaxed" && (g.round >= 8 || p.hp <= 35)
      ? Math.max(0, Math.floor((p.gold - reserve - 12) / 6))
      : 0;
  const rolls = Math.min(
    g.difficulty === "veteran" ? 12 : 8,
    settings.rolls + extraRolls,
  );
  for (let i = 0; i < rolls && p.gold >= reserve + 6; i++) {
    if (!actions.roll(g, p)) break;
    buyShop();
  }
  deployLineup(p, g.difficulty, "spread", g.combatVersion);
  const tactical=g.difficulty==="veteran"||
    (g.difficulty==="standard"&&(p.pieces.some(piece=>expensiveController(g,piece))||
      openingCores(p,g.combatVersion,pieceStrength).length>0))
    ? deployTactically(g,p,{maximumTrials:20}) : null;
  // Keep the legal eight-slot reserve. Make room only for a concrete better purchase.
  equipBot(g, p);
  return {controlPurchaseTrials,scoutedPurchases:scoutBought,deploymentTrials:tactical?.trials??0};
}
