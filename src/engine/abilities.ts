import { beginWushi, wushiTauntTarget } from "./wushi";
import { beginShuriken } from "./shuriken";
import { beginSecretOrb } from "./secret-orb";
import { beginWildfire } from "./wildfire";
import { beginThornBind } from "./thornbind";
import {applyGaze,gazeTarget} from "./gaze";
import {beginHiveCast,hiveCanCast} from "./hive";
import { releaseBoneBlast } from "./boneblast";
import { releaseBombardment } from "./bombardment";
import { launchTerminator } from "./terminator";
import { releaseWarcry, retaliateWarcry } from "./warcry";
import { releaseTornado } from "./tornado";
import { setFlight } from "./sea-ward";
import { advanceTarLaunch } from "./tar";
import { releaseStorm } from "./thunderstorm";
import { releaseJungle, jungleContains } from "./jungle";
import { releaseShieldWave } from "./shieldthrall";
import { rollAssassinCritical } from "./assassins";
import { staffSpeed } from "./staffthrall";
import { acidCells, applyCorrosion } from "./beasts";
import { inDeathSong } from "./lingjiu";
import { bladeStormActive, startBladeStorm } from "./swordthrall";
import { flameCells, ignite, silence } from "./infantry-skills";
import { commandBonuses, rallyAllies } from "./ironrooster";
import { isPhoenixEgg, enterPhoenixEgg, phoenixFlameCells } from "./phoenix";
import {
  skillReady,
  usesEnergy,
  effectiveArmor,
  attackTargets,
} from "./triggers";
import { isUndying, enterUndying } from "./immortality";
import { callWolfPack, callRetinue } from "./summons";
import {
  SKILLS,
  AURORA,
  AURORA_SKILL,
  ARHAT_QI,
  QI_SKILL,
  TAOTIE,
  TAOTIE_SKILL,
  MOTOR_TAR,
  TAR_SKILL,
  THUNDERSTORM,
  STORM_SKILL,
  JUNGLE,
  JUNGLE_SKILL,
  WUSHI_SKILL,
  SHURIKEN_SKILL,
  SECRET_ORB_SKILL,
  BOMBARDMENT,
  BOMBARDMENT_SKILL,
  TERMINATOR,
  TERMINATOR_SKILL,
  WARCRY,
  WARCRY_SKILL,
  TORNADO,
  TORNADO_SKILL,
  WILDFIRE_SKILL,
  BONEBLAST,
  BONEBLAST_SKILL,
  THORNBIND_SKILL,
  GAZE_SKILL,
  HIVE,HIVE_SKILL,
  HAWK_METAMORPH,
  AXE_THROW,
  TUSK_CHARGE,
  ACID_POLLUTION,
  DEATH_SONG,
  BURROW_SKILL,
  PANGOLIN_BURROW,
} from "../data/skills";
import { UNIT } from "../data/units";
import type { CombatEffect, CombatEvent, DamageType, Fighter } from "./types";

export const ATTACK_MANA = 25;
export const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const attackInterval = (f: Fighter, tick: number) =>
  Math.max(
    f.hive ? HIVE.needlesPerAttack*HIVE.needleInterval : 1,
    (f.interval / (1 + staffSpeed(f) + (f.formationHaste ?? 0))) *
      (f.hasteUntil > tick ? 0.7 : 1) *
      (f.slow && f.slow.until > tick ? f.slow.multiplier : 1),
  );
export const combatAttack = (f: Fighter, tick: number) =>
  (f.attack +
    (f.taotie?.rage && f.taotie.rage.until > tick ? f.taotie.rage.attack : 0)) *
  (1 + (f.aurora?.stacks ?? 0) * AURORA.attackPerStack) *
  (1 +
    Math.max(
      f.attackBoost && f.attackBoost.until > tick ? f.attackBoost.ratio : 0,
      commandBonuses(f, tick).attack,
    ));
/** Local deterministic random sequence. Does not consume campaign RNG or alter old replays. */
function dodges(source: Fighter, target: Fighter, tick: number) {
  const air = target.air;
  if (!air || !air.flying || air.evasion <= 0 || source.air?.antiAir)
    return false;
  let n =
    (Math.imul(source.uid, 374761393) ^
      Math.imul(target.uid, 668265263) ^
      Math.imul(++air.attempts, 1274126177) ^
      tick) >>>
    0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967296 < air.evasion;
}
export function recoveredMana(f: Fighter, amount: number) {
  const gain = amount * (f.energyMultiplier ?? 1);
  return f.energyPenalty ? Math.max(0, gain - f.energyPenalty) : gain;
}
export function gainMana(f: Fighter, amount: number, tick: number) {
  if (usesEnergy(f) && f.hp > 0 && f.manaLockUntil <= tick)
    f.mana = Math.min(100, f.mana + recoveredMana(f, amount));
}
export interface CombatContext {
  fighters: Fighter[];
  tick: number;
  events: CombatEvent[];
  effects: CombatEffect[];
}
export function effect(
  ctx: CombatContext,
  source: Fighter,
  target: Fighter,
  kind: CombatEffect["kind"],
  amount: number,
  name: string,
) {
  ctx.effects.push({
    source: source.uid,
    target: target.uid,
    kind,
    amount,
    name,
    from: { x: source.x, y: source.y },
    to: { x: target.x, y: target.y },
  });
}
export function damage(
  ctx: CombatContext,
  source: Fighter,
  target: Fighter,
  raw: number,
  type: DamageType = "physical",
  skill = false,
  primary = true,
  penetration = 0,
  deathBurst = false,
  reflected = false,
  periodic = false,
  empowered = false,
  gale = 0,
  committed = false,
) {
  if (
    (source.hp <= 0 &&
      !reflected &&
      !periodic &&
      !committed &&
      !(deathBurst && source.deathBurst === "spent")) ||
    target.hp <= 0
  )
    return 0;
  const wasPhoenixEgg = isPhoenixEgg(target);
  const assassinCritical =
    !skill &&
    !reflected &&
    !periodic &&
    source.stunUntil <= ctx.tick &&
    source.side !== target.side &&
    distance(source, target) <= source.range &&
    !!source.assassinCrit &&
    attackTargets(source, ctx.fighters, ctx.tick).some(
      (f) => f.uid === target.uid,
    ) &&
    rollAssassinCritical(source);
  if (assassinCritical) {
    raw *= source.assassinCrit!.multiplier;
    empowered = true;
  }
  if (!skill && source.trueAttack) type = "true";
  const groundBonus =
    (source.groundBonus ?? 0) +
    (source.air?.flying ? (source.air.groundBonus ?? 0) : 0);
  if (!skill && groundBonus && !target.air?.flying) raw *= 1 + groundBonus;
  const reflectHit = (received = false) => {
    if (
      !reflected &&
      (target.reflection ?? 0) > 0 &&
      source.hp > 0 &&
      source.side !== target.side
    ) {
      effect(ctx, target, source, "reflect", target.reflection!, "灵能反伤");
      damage(
        ctx,
        target,
        source,
        target.reflection!,
        "true",
        true,
        false,
        0,
        false,
        true,
      );
    }
    if (!reflected && received) retaliateWarcry(ctx,target,source);
  };
  if (isUndying(target) || (skill && bladeStormActive(target, ctx.tick))) {
    ctx.events.push({
      attacker: source.uid,
      target: target.uid,
      amount: 0,
      absorbed: 0,
      damageType: type,
      skill,
      primary,
      ranged: source.range > 1,
      ...(empowered ? { empowered: true } : {}),
      ...(assassinCritical ? { assassinCritical: true } : {}),
      ...(gale ? { gale } : {}),
      ...(!skill && source.hawkForm?.active
        ? { strike: 3 - (source.combo?.remaining ?? 2) }
        : {}),
      immune: true,
      ...(reflected ? { reflected: true } : {}),
      ...(periodic ? { periodic: true } : {}),
      from: { x: source.x, y: source.y },
      to: { x: target.x, y: target.y },
    });
    reflectHit();
    return 0;
  }
  if (!skill && dodges(source, target, ctx.tick)) {
    ctx.events.push({
      attacker: source.uid,
      target: target.uid,
      amount: 0,
      absorbed: 0,
      damageType: type,
      skill: false,
      primary,
      ranged: source.range > 1,
      ...(empowered ? { empowered: true } : {}),
      ...(assassinCritical ? { assassinCritical: true } : {}),
      ...(gale ? { gale } : {}),
      ...(!skill && source.hawkForm?.active
        ? { strike: 3 - (source.combo?.remaining ?? 2) }
        : {}),
      evaded: true,
      from: { x: source.x, y: source.y },
      to: { x: target.x, y: target.y },
    });
    return 0;
  }
  if (!skill && source.air?.antiAir && target.air?.flying) raw *= 1.5;
  if (
    source.air &&
    (source.air.siegeDirect ? !reflected && !periodic : !skill)
  ) {
    if (
      target.summon
        ? target.summon.kind === "puppet"
        : UNIT[target.defId].traits.some(
            (t) =>
              ["装甲", "空军", "傀儡", "海神", "异虫"].includes(t) ||
              (source.air!.siegeDirect && t === "不朽"),
          )
    )
      raw *= 1 + source.air.siege;
  }
  if (!skill && source.attackShred > 0) {
    target.armorBreak = Math.max(target.armorBreak, source.attackShred);
    target.armorBreakUntil = Math.max(target.armorBreakUntil, ctx.tick + 12);
  }
  const armor =
    Math.max(
      0,
      effectiveArmor(target, ctx.tick, ctx.fighters) -
        (target.armorBreakUntil > ctx.tick ? target.armorBreak : 0) -
        (type === "physical" ? (source.armorPenetration ?? 0) : 0),
    ) *
    (1 - penetration);
  const mitigation =
    type === "physical"
      ? 100 / (100 + armor * 6)
      : type === "magic"
        ? 1 - target.magicResist
        : 1;
  const total = Math.max(1, Math.round(raw * mitigation));
  const absorbed = Math.min(target.shield, total);
  target.shield -= absorbed;
  target.absorbed += absorbed;
  const amount = Math.min(target.hp, total - absorbed);
  target.hp -= amount;
  source.damage += amount;
  if (target.hp === 0) {
    if (wasPhoenixEgg && target.wildfire) target.wildfire.brokenEggs++;
    delete target.bladeStorm;
    delete target.petrifyUntil;
    interruptAirSkill(ctx, target);
  }
  if (
    !reflected &&
    amount > 0 &&
    source.air &&
    source.air.seaTick !== ctx.tick &&
    source.air.seaMana > 0
  ) {
    source.air.seaTick = ctx.tick;
    gainMana(source, source.air.seaMana, ctx.tick);
  }
  // Preserve the historical lethal-hit energy value for old replay snapshots.
  if (!reflected && usesEnergy(target) && target.manaLockUntil <= ctx.tick)
    target.mana = Math.min(100, target.mana + recoveredMana(target, 10));
  ctx.events.push({
    ...(reflected ? { reflected: true } : {}),
    ...(periodic ? { periodic: true } : {}),
    attacker: source.uid,
    target: target.uid,
    amount,
    absorbed,
    damageType: type,
    skill,
    primary,
    ranged: source.range > 1,
    ...(empowered ? { empowered: true } : {}),
    ...(assassinCritical ? { assassinCritical: true } : {}),
    ...(gale ? { gale } : {}),
    ...(!skill && source.hawkForm?.active
      ? { strike: 3 - (source.combo?.remaining ?? 2) }
      : {}),
    from: { x: source.x, y: source.y },
    to: { x: target.x, y: target.y },
  });
  if (
    !skill &&
    !periodic &&
    !reflected &&
    amount > 0 &&
    source.attackManaReady
  ) {
    source.attackManaReady = false;
    if (
      source.damageManaBonus &&
      usesEnergy(source) &&
      source.hp > 0 &&
      source.manaLockUntil <= ctx.tick
    ) {
      const before = source.mana;
      // Amplify the same attack recovery. Cavalry's flat penalty must be charged only once.
      const extra =
        recoveredMana(source, ATTACK_MANA * (1 + source.damageManaBonus)) -
        recoveredMana(source, ATTACK_MANA);
      source.mana = Math.min(100, source.mana + Math.max(0, extra));
      if (source.mana > before)
        effect(
          ctx,
          source,
          source,
          "energize",
          source.mana - before,
          "召唤回能",
        );
    }
  }
  if (!skill && !periodic && !reflected && source.lifesteal > 0)
    heal(
      ctx,
      source,
      source,
      amount * source.lifesteal,
      source.teamLifesteal ? "普攻吸血" : "治疗",
    );
  if (target.hp === 0 && target.supportHeal > 0) {
    const healing = target.supportHeal,
      mana = target.supportMana;
    target.supportHeal = 0;
    target.supportMana = 0;
    for (const ally of ctx.fighters.filter(
      (f) => f.side === target.side && f.hp > 0,
    )) {
      heal(ctx, target, ally, healing);
      gainMana(ally, mana, ctx.tick);
      effect(ctx, target, ally, "cleanse", mana, "支援余辉");
    }
  }
  if (target.hp === 0 && target.deathBurst === "ready") {
    target.deathBurst = "spent";
    if (target.signature) target.signature.casts++;
    effect(ctx, target, target, "cast", 2, "爆裂虫·殉爆");
    for (const enemy of ctx.fighters.filter(
      (f) => f.hp > 0 && f.side !== target.side && distance(f, target) <= 2,
    ))
      damage(
        ctx,
        target,
        enemy,
        target.maxHp * 0.35 * target.skillPower,
        "magic",
        true,
        false,
        0,
        true,
      );
  }
  if (target.hp === 0) {
    delete target.jungleLandings;
    delete target.taunt;
  }
  if (target.hp === 0 && !enterPhoenixEgg(ctx, target))
    enterUndying(ctx, target);
  reflectHit(amount>0 || absorbed>0);
  return amount;
}
export function heal(
  ctx: CombatContext,
  source: Fighter,
  target: Fighter,
  amount: number,
  name = "治疗",
) {
  if (target.hp <= 0 || isUndying(target) || isPhoenixEgg(target)) return;
  const actual = Math.max(
    0,
    Math.min(target.maxHp - target.hp, Math.round(amount)),
  );
  if (!actual) return;
  target.hp += actual;
  source.healing += actual;
  effect(ctx, source, target, "heal", actual, name);
}
function shield(
  ctx: CombatContext,
  source: Fighter,
  ratio: number,
  duration: number,
  target = source,
) {
  if (isUndying(target) || isPhoenixEgg(target)) return;
  const amount = Math.round(source.maxHp * ratio * source.skillPower);
  // Recasting refreshes the stronger shield; cannot bank infinite shields.
  const remainingUntil = target.shield > 0 ? target.shieldUntil : 0;
  target.shield = Math.max(target.shield, amount);
  target.shieldUntil =
    source.defId === "deer"
      ? Math.max(remainingUntil, ctx.tick + duration)
      : ctx.tick + duration;
  effect(ctx, source, target, "shield", amount, "护盾");
}
function fortify(
  ctx: CombatContext,
  source: Fighter,
  target: Fighter,
  armor: number,
  duration: number,
) {
  target.armorBuff = Math.max(target.armorBuff, armor);
  target.armorBuffUntil = Math.max(target.armorBuffUntil, ctx.tick + duration);
  effect(ctx, source, target, "fortify", armor, `护甲 +${armor}`);
}
/** Charge only into a free adjacent cell. No movement may overlap a living unit. */
function dashTo(
  ctx: CombatContext,
  source: Fighter,
  target: Fighter,
  name = "冲锋",
): boolean {
  if (distance(source, target) <= 1) return true;
  const cell = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]
    .map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy }))
    .filter(
      (p) =>
        p.x >= 0 &&
        p.x < 8 &&
        p.y >= 0 &&
        p.y < 8 &&
        !ctx.fighters.some((f) => f.hp > 0 && f.x === p.x && f.y === p.y),
    )
    .sort((a, b) => distance(source, a) - distance(source, b))[0];
  if (!cell) return false;
  const from = { x: source.x, y: source.y };
  source.x = cell.x;
  source.y = cell.y;
  ctx.effects.push({
    source: source.uid,
    target: source.uid,
    kind: "teleport",
    amount: 0,
    name,
    from,
    to: cell,
  });
  return true;
}
function stun(
  ctx: CombatContext,
  source: Fighter,
  target: Fighter,
  ticks: number,
  name = "眩晕",
) {
  if (
    target.hp <= 0 ||
    isPhoenixEgg(target) ||
    bladeStormActive(target, ctx.tick)
  )
    return;
  interruptAirSkill(ctx, target);
  target.stunUntil = Math.max(target.stunUntil, ctx.tick + ticks + 1);
  effect(ctx, source, target, "stun", ticks / 4, name);
}
function breakArmor(ctx: CombatContext, source: Fighter, target: Fighter) {
  target.armorBreak = 4;
  target.armorBreakUntil = ctx.tick + 16;
  effect(ctx, source, target, "break", 4, "破甲");
}
function blink(ctx: CombatContext, source: Fighter, fallback: Fighter) {
  const weakest = ctx.fighters
    .filter((f) => f.side !== source.side && f.hp > 0)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.uid - b.uid)[0];
  if (!weakest || distance(source, weakest) === 1) return weakest ?? fallback;
  const cells = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ].map(([dx, dy]) => ({ x: weakest.x + dx, y: weakest.y + dy }));
  const cell = cells.find(
    (p) =>
      p.x >= 0 &&
      p.x < 8 &&
      p.y >= 0 &&
      p.y < 8 &&
      !ctx.fighters.some((f) => f.hp > 0 && f.x === p.x && f.y === p.y),
  );
  if (!cell)
    return distance(source, fallback) <= source.range ? fallback : null;
  const from = { x: source.x, y: source.y };
  source.x = cell.x;
  source.y = cell.y;
  ctx.effects.push({
    source: source.uid,
    target: source.uid,
    kind: "teleport",
    amount: 0,
    name: "突袭",
    from,
    to: cell,
  });
  return weakest;
}
export function lineTargets(
  source: Fighter,
  target: Fighter,
  fighters: Fighter[],
) {
  const dx = target.x - source.x,
    dy = target.y - source.y,
    length = Math.hypot(dx, dy) || 1;
  return fighters
    .filter((f) => f.side !== source.side && f.hp > 0)
    .filter((f) => {
      const x = f.x - source.x,
        y = f.y - source.y;
      return x * dx + y * dy > 0 && Math.abs(x * dy - y * dx) / length <= 0.65;
    })
    .sort((a, b) => distance(source, a) - distance(source, b) || a.uid - b.uid);
}
export function interruptAirSkill(ctx: CombatContext, source: Fighter) {
  if (
    !source.air?.cast &&
    !source.windup &&
    !source.combo &&
    !source.bird?.draw &&
    !source.wildfire?.casting && !source.wildfire?.channel && !source.thornbind?.channel && !source.hive?.casting
  )
    return;
  const wasDrawing = !!source.bird?.draw;
  if(source.hive?.casting){source.hive.interrupted++;source.hive.actedAt=ctx.tick;delete source.hive.casting;}
  if(source.thornbind?.channel){source.thornbind.interrupted++;delete source.thornbind.channel;}
  if (source.boneblast && source.air?.cast?.kind === "boneblast") source.boneblast.interrupted++;
  if (source.wildfire?.casting || source.wildfire?.channel) {
    source.wildfire.interrupted++;
    delete source.wildfire.casting;
    delete source.wildfire.channel;
  }
  if (source.bird) delete source.bird.draw;
  if (source.air) delete source.air.cast;
  delete source.windup;
  delete source.combo;
  effect(
    ctx,
    source,
    source,
    "silence",
    0,
    wasDrawing ? "蓄力中断" : "施法中断",
  );
}
/** Resolve telegraphed spells before acting; stuns, charm or death cancel the remaining channel. */
export function advanceAirSkills(ctx: CombatContext, source: Fighter): boolean {
  const pending = source.air?.cast;
  if (!pending) return false;
  if (
    source.hp <= 0 ||
    source.charm ||
    source.stunUntil > ctx.tick ||
    (["irondog", "specialist", "ironape", "tar", "storm", "jungle", "bombardment", "terminator", "warcry", "tornado", "boneblast"].includes(pending.kind) &&
      (source.silenceUntil ?? 0) > ctx.tick)
  ) {
    interruptAirSkill(ctx, source);
    return true;
  }
  if (pending.kind === "specialist") {
    const target = attackTargets(source, ctx.fighters, ctx.tick).find(
      (f) => f.uid === pending.target && distance(source, f) <= source.range,
    );
    if (!target) {
      interruptAirSkill(ctx, source);
      return true;
    }
    // Track the locked unit, never a substitute or a now-concealed location.
    pending.to = { x: target.x, y: target.y };
    if (pending.next > ctx.tick) return true;
    effect(ctx, source, target, "pulse", 0, "定点狙击");
    damage(ctx, source, target, pending.damage, "magic", true, true);
    if (source.air?.cast !== pending) return true;
    if (target.hp > 0 && !isUndying(target) && !isPhoenixEgg(target))
      stun(ctx, source, target, 3);
    delete source.air!.cast;
    return true;
  }
  if (pending.next > ctx.tick) return true;
  if (pending.kind === "boneblast") {
    releaseBoneBlast(source, ctx.tick);
    return true;
  }
  if (pending.kind === "tornado") {
    releaseTornado(source,ctx.tick);
    return true;
  }
  if (pending.kind === "warcry") {
    releaseWarcry(ctx,source);
    return true;
  }
  if (pending.kind === "terminator") {
    launchTerminator(ctx, source);
    return true;
  }
  if (pending.kind === "bombardment") {
    releaseBombardment(source, ctx.tick);
    return true;
  }
  if (pending.kind === "jungle") {
    releaseJungle(ctx, source);
    return true;
  }
  if (pending.kind === "storm") {
    releaseStorm(source);
    return true;
  }
  if (pending.kind === "tar") {
    advanceTarLaunch(ctx, source);
    return true;
  }
  if (pending.kind === "motorcycle") {
    const target = attackTargets(source, ctx.fighters, ctx.tick)
      .filter((f) => distance(source, f) <= source.range)
      .sort(
        (a, b) => distance(source, a) - distance(source, b) || a.uid - b.uid,
      )[0];
    if (!target || (source.silenceUntil ?? 0) > ctx.tick) {
      interruptAirSkill(ctx, source);
      return true;
    }
    // Each shot chooses a living, visible target now; committed damage is fixed at cast time.
    damage(ctx, source, target, pending.damage, "magic", true, true);
    if (source.air?.cast !== pending) return true; // Reflection may kill the rider.
    if (--pending.remaining === 0) delete source.air!.cast;
    else pending.next += 2;
    return true;
  }
  if (pending.kind === "ironape") {
    // A committed area slam follows the caster, not the original target.
    // Resolve each damage packet normally; lethal reflection stops further hits.
    const targets = ctx.fighters.filter(
      (f) => f.hp > 0 && f.side !== source.side && distance(source, f) <= 2,
    );
    effect(ctx, source, source, "pulse", 2, "重装震爆");
    for (const target of targets) {
      damage(ctx, source, target, pending.damage, "magic", true, true);
      if (source.air?.cast !== pending) return true;
    }
    delete source.air!.cast;
    return true;
  }
  if (pending.kind === "irondog") {
    if ((source.silenceUntil ?? 0) > ctx.tick) {
      interruptAirSkill(ctx, source);
      return true;
    }
    // Area pulses hit current adjacent enemies, including concealed targets.
    // A dead victim never consumes later pulses on behalf of a new arrival.
    const targets = ctx.fighters.filter(
      (f) => f.hp > 0 && f.side !== source.side && distance(source, f) <= 1,
    );
    effect(ctx, source, source, "pulse", 1, "震荡压制");
    for (const target of targets) {
      damage(ctx, source, target, pending.damage, "magic", true, true);
      if (source.air?.cast !== pending) return true; // Lethal reflection stops the channel.
      if (target.hp > 0 && !isUndying(target) && !isPhoenixEgg(target))
        stun(ctx, source, target, 1);
    }
    if (--pending.remaining === 0) delete source.air!.cast;
    else pending.next += 3;
    return true;
  }
  if (pending.kind === "medic") {
    for (const ally of ctx.fighters)
      if (ally.side === source.side && distance(ally, pending.to) <= 2)
        heal(ctx, source, ally, pending.damage);
    if (--pending.remaining === 0) delete source.air!.cast;
    else pending.next += 4;
    return true;
  }
  const enemies = ctx.fighters.filter(
    (f) => f.hp > 0 && f.side !== source.side,
  );
  const targets =
    pending.kind === "phoenix"
      ? enemies.filter((f) =>
          phoenixFlameCells(pending.from, pending.to).some(
            (cell) => cell.x === f.x && cell.y === f.y,
          ),
        )
      : pending.kind === "ark"
        ? lineTargets(
            { ...source, ...pending.from },
            { ...source, ...pending.to },
            ctx.fighters,
          )
        : enemies
            .filter(
              (f) =>
                distance(f, pending.kind === "bomber" ? source : pending.to) <=
                2,
            )
            .sort(
              (a, b) =>
                distance(a, pending.to) - distance(b, pending.to) ||
                a.uid - b.uid,
            )
            .slice(0, pending.kind === "eel" ? 4 : 64);
  ctx.effects.push({
    source: source.uid,
    target: source.uid,
    kind: "pulse",
    name:
      pending.kind === "whale"
        ? "虚空潮汐"
        : pending.kind === "phoenix"
          ? "不死烈焰"
          : pending.kind === "ark"
            ? "虚空光束"
            : pending.kind === "eel"
              ? "雷霆脉冲"
              : "轰炸脉冲",
    amount: 2,
    from: pending.from,
    to: pending.kind === "bomber" ? { x: source.x, y: source.y } : pending.to,
  });
  for (const target of targets) {
    damage(
      ctx,
      source,
      target,
      pending.kind === "whale" ? target.maxHp * pending.damage : pending.damage,
      pending.kind === "whale" ? "true" : "magic",
      true,
      false,
    );
    if (
      ["phoenix", "whale"].includes(pending.kind) &&
      source.air?.cast !== pending
    )
      break;
  }
  if (--pending.remaining === 0) delete source.air!.cast;
  else pending.next += 4;
  return true;
}
function energyTargets(ctx: CombatContext, source: Fighter) {
  return ctx.fighters
    .filter(
      (f) =>
        f.hp > 0 &&
        f.side === source.side &&
        f.defId !== "acolyte" &&
        usesEnergy(f) &&
        f.mana < 100 &&
        f.manaLockUntil <= ctx.tick &&
        !f.charm &&
        distance(source, f) <= 3,
    )
    .sort(
      (a, b) =>
        combatAttack(b, ctx.tick) - combatAttack(a, ctx.tick) || a.uid - b.uid,
    )
    .slice(0, 2);
}
export function castSkill(
  ctx: CombatContext,
  source: Fighter,
  target: Fighter,
) {
  if (source.gospelAura || source.rifle) return false;
  if (wushiTauntTarget(ctx, source)) return false;
  const s = source.hive ? HIVE_SKILL : source.gaze ? GAZE_SKILL : source.thornbind ? THORNBIND_SKILL : source.boneblast ? BONEBLAST_SKILL : source.wildfire ? WILDFIRE_SKILL : source.tornado ? TORNADO_SKILL : source.warcry ? WARCRY_SKILL : source.terminator ? TERMINATOR_SKILL : source.bombardment ? BOMBARDMENT_SKILL : source.secretOrb ? SECRET_ORB_SKILL : source.shuriken ? SHURIKEN_SKILL : source.wushi ? WUSHI_SKILL : source.jungle ? JUNGLE_SKILL : source.storm ? STORM_SKILL : source.tar
    ? TAR_SKILL
    : source.taotie
      ? TAOTIE_SKILL
      : source.qiSkill
        ? QI_SKILL
        : source.aurora
          ? AURORA_SKILL
          : source.burrowSkill
            ? BURROW_SKILL
            : source.hawkForm
              ? HAWK_METAMORPH
              : SKILLS[source.defId];
  if (!s || source.hp <= 0 || !skillReady(source) || target.hp <= 0)
    return false;
  if(source.hive&&(source.charm||source.stunUntil>ctx.tick||(source.silenceUntil??0)>ctx.tick||
    (source.skillReadyAt??0)>ctx.tick||!hiveCanCast(ctx,source)))return false;
  if(source.gaze){
    if(source.charm||source.stunUntil>ctx.tick||(source.silenceUntil??0)>ctx.tick||
      (source.skillReadyAt??0)>ctx.tick)return false;
    const selected=gazeTarget(ctx,source);if(!selected)return false;target=selected;
  }
  if (source.thornbind && (source.charm || source.stunUntil>ctx.tick ||
    (source.skillReadyAt??0)>ctx.tick || distance(source,target)>source.range ||
    !attackTargets(source,ctx.fighters,ctx.tick).some(f=>f.uid===target.uid))) return false;
  if (source.boneblast && (!source.air || source.charm || source.stunUntil > ctx.tick ||
    (source.skillReadyAt ?? 0) > ctx.tick || distance(source, target) > source.range ||
    (source.x === target.x && source.y === target.y) ||
    !attackTargets(source, ctx.fighters, ctx.tick).some(f => f.uid === target.uid))) return false;
  if (source.wildfire && (source.charm || source.stunUntil > ctx.tick ||
    (source.skillReadyAt ?? 0) > ctx.tick || distance(source, target) > source.range ||
    (source.x === target.x && source.y === target.y) ||
    !attackTargets(source, ctx.fighters, ctx.tick).some(f => f.uid === target.uid))) return false;
  if (source.tornado && (!source.air || source.charm || source.stunUntil>ctx.tick ||
    (source.skillReadyAt??0)>ctx.tick || distance(source,target)>source.range ||
    (source.x===target.x && source.y===target.y) ||
    !attackTargets(source,ctx.fighters,ctx.tick).some(f=>f.uid===target.uid))) return false;
  if (source.warcry && (!source.air || source.charm || source.stunUntil>ctx.tick ||
    (source.skillReadyAt??0)>ctx.tick || distance(source,target)>source.range ||
    (source.x===target.x && source.y===target.y) ||
    !attackTargets(source,ctx.fighters,ctx.tick).some(f=>f.uid===target.uid))) return false;
  if (source.terminator && (!source.air || source.air.cast || source.charm ||
    source.stunUntil > ctx.tick || (source.skillReadyAt ?? 0) > ctx.tick ||
    distance(source, target) > source.range ||
    !attackTargets(source, ctx.fighters, ctx.tick).some(f => f.uid === target.uid))) return false;
  if (source.bombardment && (!source.air || source.air.cast || source.charm ||
    source.stunUntil > ctx.tick || (source.skillReadyAt ?? 0) > ctx.tick ||
    distance(source, target) > source.range || (source.x === target.x && source.y === target.y) ||
    !attackTargets(source, ctx.fighters, ctx.tick).some(f => f.uid === target.uid))) return false;
  if (source.secretOrb && (source.charm || source.stunUntil>ctx.tick ||
    (source.skillReadyAt??0)>ctx.tick || distance(source,target)>source.range ||
    !attackTargets(source,ctx.fighters,ctx.tick).some(f=>f.uid===target.uid)))return false;
  if (source.shuriken && (source.charm || source.stunUntil > ctx.tick ||
    (source.skillReadyAt ?? 0) > ctx.tick || distance(source,target) > source.range ||
    !attackTargets(source,ctx.fighters,ctx.tick).some(f => f.uid === target.uid))) return false;
  if (source.wushi && (source.charm || source.stunUntil > ctx.tick || (source.skillReadyAt ?? 0) > ctx.tick)) return false;
  if (source.jungle && (!source.air || source.air.cast || source.charm || source.stunUntil > ctx.tick ||
    (source.skillReadyAt ?? 0) > ctx.tick || !jungleContains(source, target) ||
    !attackTargets(source, ctx.fighters, ctx.tick).some((f) => f.uid === target.uid))) return false;
  if (source.storm && (!source.air || source.charm || source.stunUntil > ctx.tick ||
    (source.skillReadyAt ?? 0) > ctx.tick || distance(source, target) > source.range ||
    (source.x === target.x && source.y === target.y) ||
    !attackTargets(source, ctx.fighters, ctx.tick).some((f) => f.uid === target.uid))) return false;
  if (source.tar && (source.charm || source.stunUntil > ctx.tick)) return false;
  if ((source.silenceUntil ?? 0) > ctx.tick && usesEnergy(source)) return false;
  if (
    (source.aurora || source.qiSkill) &&
    (source.stunUntil > ctx.tick ||
      (source.skillReadyAt ?? 0) > ctx.tick ||
      distance(source, target) > source.range ||
      !attackTargets(source, ctx.fighters, ctx.tick).some(
        (f) => f.uid === target.uid,
      ))
  )
    return false;
  if (
    source.burrowSkill &&
    (source.stunUntil > ctx.tick ||
      (source.skillReadyAt ?? 0) > ctx.tick ||
      distance(source, target) > PANGOLIN_BURROW.range ||
      !attackTargets(source, ctx.fighters, ctx.tick).some(
        (f) => f.uid === target.uid,
      ) ||
      !dashTo(ctx, source, target, "遁地"))
  )
    return false;
  if (
    ["motorcycle", "irondog", "specialist", "ironape", "ironrooster"].includes(
      source.defId,
    ) &&
    (!source.air ||
      (["irondog", "specialist", "ironape", "ironrooster"].includes(
        source.defId,
      ) &&
        source.stunUntil > ctx.tick) ||
      (source.skillReadyAt ?? 0) > ctx.tick ||
      distance(source, target) > source.range ||
      !attackTargets(source, ctx.fighters, ctx.tick).some(
        (f) => f.uid === target.uid,
      ))
  )
    return false;
  if (
    source.defId === "axethrall" &&
    (source.stunUntil > ctx.tick ||
      (source.skillReadyAt ?? 0) > ctx.tick ||
      distance(source, target) > AXE_THROW.range ||
      !attackTargets(source, ctx.fighters, ctx.tick).some(
        (f) => f.uid === target.uid,
      ))
  )
    return false;
  if (
    ["swordthrall", "shieldthrall", "elephant"].includes(source.defId) &&
    (source.stunUntil > ctx.tick ||
      (source.skillReadyAt ?? 0) > ctx.tick ||
      distance(source, target) > source.range ||
      !attackTargets(source, ctx.fighters, ctx.tick).some(
        (f) => f.uid === target.uid,
      ))
  )
    return false;
  if (
    source.defId === "venombeast" &&
    (source.stunUntil > ctx.tick ||
      (source.skillReadyAt ?? 0) > ctx.tick ||
      distance(source, target) > ACID_POLLUTION.range ||
      !attackTargets(source, ctx.fighters, ctx.tick).some(
        (f) => f.uid === target.uid,
      ))
  )
    return false;
  if (source.defId === "lingjiu") {
    if (source.stunUntil > ctx.tick || (source.skillReadyAt ?? 0) > ctx.tick)
      return false;
    // A self-centered circle must not be blocked by the ordinary Manhattan target tie-break.
    const nearby = attackTargets(source, ctx.fighters, ctx.tick)
      .filter((enemy) => inDeathSong(source, enemy))
      .sort(
        (a, b) =>
          Math.hypot(a.x - source.x, a.y - source.y) -
            Math.hypot(b.x - source.x, b.y - source.y) || a.uid - b.uid,
      )[0];
    if (!nearby) return false;
    target = nearby;
  }
  if (source.defId === "medic") {
    if (
      !source.air ||
      !ctx.fighters.some(
        (f) =>
          f.side === source.side &&
          f.hp > 0 &&
          f.hp < f.maxHp &&
          !isUndying(f) &&
          !isPhoenixEgg(f) &&
          distance(source, f) <= 2,
      )
    )
      return false;
    target = source;
  }
  if (source.defId === "acolyte" && !energyTargets(ctx, source).length)
    return false;
  if (source.defId === "skytoad") {
    if (
      source.taotie &&
      (source.stunUntil > ctx.tick || (source.skillReadyAt ?? 0) > ctx.tick)
    )
      return false;
    const victim = (
      source.taotie
        ? attackTargets(source, ctx.fighters, ctx.tick)
        : ctx.fighters
    )
      .filter(
        (f) =>
          f.hp > 0 &&
          f.side !== source.side &&
          !isUndying(f) &&
          f.hp < source.hp &&
          distance(source, f) <= source.range,
      )
      .sort((a, b) => b.hp - a.hp || a.uid - b.uid)[0];
    if (!victim || source.devourSpent) return false;
    target = victim;
  }
  if (source.packCall) return callWolfPack(ctx, source);
  if (source.summoning) return callRetinue(ctx, source);
  if (
    source.defId === "wasp" && !source.hive &&
    !ctx.fighters.some(
      (f) =>
        f.hp > 0 && f.side !== source.side && distance(source, f) <= s.radius,
    )
  )
    return false;
  if (source.charmCast) {
    const victim = ctx.fighters
      .filter(
        (f) =>
          f.hp > 0 &&
          f.side !== source.side &&
          !f.summon &&
          !f.charm &&
          !isPhoenixEgg(f) &&
          !bladeStormActive(f, ctx.tick) &&
          distance(source, f) <= 3,
      )
      .sort((a, b) => b.attack - a.attack || a.uid - b.uid)[0];
    if (!victim) return false;
    target = victim;
  }
  if (
    (source.defId === "panda" && !source.shuriken) ||
    source.defId === "wolf" ||
    source.defId === "ghostjet" ||
    (source.defId === "bloodhawk" && !source.hawkForm)
  ) {
    const destination = blink(ctx, source, target);
    if (!destination) return false;
    target = destination;
  }
  if (
    ["cavalry", "bull"].includes(source.defId) &&
    !dashTo(ctx, source, target)
  )
    return false;
  if (source.defId === "shadowblade") {
    const farthest = ctx.fighters
      .filter((f) => f.side !== source.side && f.hp > 0)
      .sort(
        (a, b) => distance(source, b) - distance(source, a) || a.uid - b.uid,
      )[0];
    if (dashTo(ctx, source, farthest)) target = farthest;
    else if (distance(source, target) > source.range) return false;
  }
  if (source.defId === "ironrooster" || source.wushi) target = source;
  source.mana = 0;
  if (source.signature) {
    source.signature.casts++;
    if (source.defId === "tiger") source.signature.attacks++;
  }
  source.flash = true;
  effect(ctx, source, target, "cast", s.radius, s.name);
  const enemies = () =>
    ctx.fighters.filter((f) => f.side !== source.side && f.hp > 0);
  const hit = (t: Fighter, primary = true, penetration = 0) =>
    damage(
      ctx,
      source,
      t,
      combatAttack(source, ctx.tick) * s.multiplier * source.skillPower,
      s.damageType,
      true,
      primary,
      penetration,
    );
  switch (source.defId) {
    case "lingjiu":
      source.skillReadyAt = ctx.tick + DEATH_SONG.cooldown;
      effect(ctx, source, source, "pulse", DEATH_SONG.radius, "死魂曲");
      for (const enemy of enemies().filter((enemy) =>
        inDeathSong(source, enemy),
      )) {
        if (source.hp <= 0) break;
        damage(
          ctx,
          source,
          enemy,
          DEATH_SONG.damage[source.star - 1] * source.skillPower,
          "magic",
          true,
          enemy.uid === target.uid,
        );
      }
      break;
    case "elephant":
      source.skillReadyAt = ctx.tick + TUSK_CHARGE.cooldown;
      damage(
        ctx,
        source,
        target,
        TUSK_CHARGE.damage[source.star - 1] * source.skillPower,
        "magic",
        true,
      );
      if (
        target.hp > 0 &&
        !isUndying(target) &&
        !isPhoenixEgg(target) &&
        !bladeStormActive(target, ctx.tick)
      ) {
        stun(ctx, source, target, TUSK_CHARGE.knockupTicks, "击飞");
        target.knockup = {
          start: ctx.tick,
          until: ctx.tick + TUSK_CHARGE.knockupTicks,
        };
      }
      effect(ctx, source, target, "pulse", 1, "獠牙冲");
      break;
    case "venombeast": {
      source.skillReadyAt = ctx.tick + ACID_POLLUTION.cooldown[source.star - 1];
      const cells = new Set(
        acidCells(target).map((cell) => `${cell.x},${cell.y}`),
      );
      effect(ctx, source, target, "pulse", 1, "酸性污染");
      for (const enemy of enemies().filter((enemy) =>
        cells.has(`${enemy.x},${enemy.y}`),
      )) {
        if (
          isUndying(enemy) ||
          isPhoenixEgg(enemy) ||
          bladeStormActive(enemy, ctx.tick)
        )
          continue;
        const armor = ACID_POLLUTION.armor[source.star - 1];
        applyCorrosion(
          enemy,
          source.uid,
          armor,
          ctx.tick + ACID_POLLUTION.duration,
        );
        effect(ctx, source, enemy, "break", armor, "酸性减甲");
      }
      break;
    }
    case "shieldthrall":
      releaseShieldWave(ctx, source, target);
      break;
    case "swordthrall":
      startBladeStorm(ctx, source);
      break;
    case "axethrall":
      source.skillReadyAt = ctx.tick + AXE_THROW.cooldown;
      effect(ctx, source, target, "pulse", 0, "飞斧");
      damage(
        ctx,
        source,
        target,
        AXE_THROW.damage[source.star - 1] * source.skillPower,
        "magic",
        true,
        true,
      );
      if (target.hp > 0 && !isUndying(target) && !isPhoenixEgg(target))
        stun(ctx, source, target, AXE_THROW.stunTicks);
      break;
    case "ironrooster":
      rallyAllies(ctx, source);
      break;
    case "ironape":
      source.skillReadyAt = ctx.tick + 40;
      source.air!.cast = {
        kind: "ironape",
        next: ctx.tick + 3,
        remaining: 1,
        damage: 250 * 2 ** (source.star - 1) * source.skillPower,
        from: { x: source.x, y: source.y },
        to: { x: source.x, y: source.y },
      };
      break;
    case "specialist":
      source.skillReadyAt = ctx.tick + 40;
      source.air!.cast = {
        kind: "specialist",
        target: target.uid,
        next: ctx.tick + 3,
        remaining: 1,
        damage: 300 * 2 ** (source.star - 1) * source.skillPower,
        from: { x: source.x, y: source.y },
        to: { x: target.x, y: target.y },
      };
      break;
    case "irondog":
      source.skillReadyAt = ctx.tick + 40;
      source.air!.cast = {
        kind: "irondog",
        next: ctx.tick + 2,
        remaining: 3,
        damage: 70 * 2 ** (source.star - 1) * source.skillPower,
        from: { x: source.x, y: source.y },
        to: { x: source.x, y: source.y },
      };
      break;
    case "motorcycle":
      source.skillReadyAt = ctx.tick + 40;
      source.air!.cast = {
        kind: source.tar ? "tar" : "motorcycle",
        next: ctx.tick + 2,
        remaining: source.tar ? source.star : 3,
        damage:
          (source.tar
            ? MOTOR_TAR.damage[source.star - 1]
            : 100 * 2 ** (source.star - 1)) * source.skillPower,
        ...(source.tar
          ? { marked: [], splash: MOTOR_TAR.splash * source.skillPower }
          : {}),
        from: { x: source.x, y: source.y },
        to: { x: target.x, y: target.y },
      };
      break;
    case "flametrooper": {
      const cells = flameCells(source, target);
      const burnDamage =
        combatAttack(source, ctx.tick) * 0.35 * source.skillPower;
      effect(ctx, source, target, "flame", 3, s.name);
      for (const enemy of enemies().filter((f) =>
        cells.some((c) => c.x === f.x && c.y === f.y),
      )) {
        if (source.hp <= 0) break;
        hit(enemy, enemy.uid === target.uid);
        ignite(ctx, source, enemy, burnDamage);
      }
      break;
    }
    case "grenadier": {
      effect(ctx, source, target, "grenade", 1, s.name);
      for (const enemy of enemies().filter(
        (f) => Math.abs(f.x - target.x) <= 1 && Math.abs(f.y - target.y) <= 1,
      )) {
        if (source.hp <= 0) break;
        hit(enemy, enemy.uid === target.uid);
        silence(ctx, source, enemy, 4 + source.star * 4);
      }
      break;
    }
    case "medic":
      source.air!.cast = {
        kind: "medic",
        next: ctx.tick + 4,
        remaining: 4,
        damage: (50 + source.star * 25) * source.skillPower,
        from: { x: source.x, y: source.y },
        to: { x: source.x, y: source.y },
      };
      break;
    case "whale":
      if (source.air)
        source.air.cast = {
          kind: "whale",
          next: ctx.tick + 4,
          remaining: 10,
          damage: (0.02 + source.star * 0.01) * source.skillPower,
          from: { x: source.x, y: source.y },
          to: { x: target.x, y: target.y },
        };
      break;
    case "phoenix":
      if (source.wildfire) {
        beginWildfire(ctx, source, target);
        break;
      }
      if (source.air)
        source.air.cast = {
          kind: "phoenix",
          next: ctx.tick + 4,
          remaining: 4,
          damage:
            combatAttack(source, ctx.tick) * s.multiplier * source.skillPower,
          from: { x: source.x, y: source.y },
          to: { x: target.x, y: target.y },
        };
      break;
    case "bat":
      stun(ctx, source, target, 4);
      target.sonic = (target.sonic ?? []).filter(
        (dot) => dot.source !== source.uid,
      );
      target.sonic.push({
        source: source.uid,
        next: ctx.tick + 1,
        remaining: 5,
        damage: combatAttack(source, ctx.tick) * 0.4 * source.skillPower,
      });
      break;
    case "bloodhawk": {
      if (source.hawkForm) {
        source.hawkForm.active = true;
        heal(ctx, source, source, source.maxHp);
        if (source.air) {
          setFlight(source, false);
          source.air.evasion = 0;
          source.air.seaMana = 0;
        }
        effect(ctx, source, source, "transform", 1, HAWK_METAMORPH.name);
        break;
      }
      const amount = hit(target);
      heal(ctx, source, source, amount * 0.5);
      break;
    }
    case "skytoad": {
      if (source.taotie)
        source.skillReadyAt = ctx.tick + TAOTIE.cooldown[source.star - 1];
      else source.devourSpent = true;
      const before = target.hp;
      effect(
        ctx,
        source,
        target,
        "devour",
        1,
        source.taotie ? TAOTIE.name : "吞云噬体",
      );
      const dealt = damage(
        ctx,
        source,
        target,
        target.hp + target.shield,
        "true",
        true,
      );
      if (
        source.taotie &&
        dealt >= before &&
        source.hp > 0 &&
        !isUndying(source)
      ) {
        source.taotie.feasts++;
        heal(ctx, source, source, TAOTIE.healing[source.star - 1], "饕餮回复");
        source.taotie.rage = {
          until: ctx.tick + TAOTIE.duration,
          attack: TAOTIE.attack[source.star - 1],
        };
        effect(
          ctx,
          source,
          source,
          "haste",
          TAOTIE.attack[source.star - 1],
          "饕餮狂暴",
        );
      }
      break;
    }
    case "vajra":
      shield(ctx, source, 0.2, 16);
      for (const enemy of enemies().filter((f) => distance(source, f) <= 1)) {
        hit(enemy, enemy.uid === target.uid);
        if (enemy.hp <= 0 || bladeStormActive(enemy, ctx.tick)) continue;
        enemy.slow = {
          until: Math.max(enemy.slow?.until ?? 0, ctx.tick + 16),
          multiplier: 1.4,
        };
        effect(ctx, source, enemy, "slow", 4, "攻速降低");
      }
      break;
    case "arhat":
      if (source.qiSkill) source.skillReadyAt = ctx.tick + ARHAT_QI.cooldown;
      source.windup = {
        until: ctx.tick + (source.qiSkill ? ARHAT_QI.windup : 4),
        target: target.uid,
        damage: source.qiSkill
          ? ARHAT_QI.damage[source.star - 1] * source.skillPower
          : combatAttack(source, ctx.tick) * s.multiplier * source.skillPower,
        ...(source.qiSkill ? { damageType: "magic" as const } : {}),
      };
      effect(
        ctx,
        source,
        target,
        "windup",
        1,
        source.qiSkill ? "晶核蓄力" : "真言蓄力",
      );
      break;
    case "winddragon":
      if(source.tornado && source.air){
        source.skillReadyAt=ctx.tick+TORNADO.cooldown;
        source.air.cast={kind:"tornado",next:ctx.tick+TORNADO.windup,remaining:1,
          damage:TORNADO.damage[source.star-1]*source.skillPower,
          from:{x:source.x,y:source.y},to:{x:target.x,y:target.y}};
        break;
      }
      for (const enemy of enemies().filter((f) => distance(f, target) <= 1)) {
        hit(enemy, enemy.uid === target.uid);
        stun(ctx, source, enemy, 6);
      }
      break;
    case "acolyte":
      for (const ally of energyTargets(ctx, source)) {
        const before = ally.mana;
        gainMana(ally, 15 + source.star * 10, ctx.tick);
        effect(ctx, source, ally, "energize", ally.mana - before, "灵珠充能");
      }
      break;
    case "stormcaller":
      if (source.storm) {
        source.skillReadyAt = ctx.tick + THUNDERSTORM.cooldown[source.star - 1];
        source.air!.cast = { kind: "storm", next: ctx.tick + THUNDERSTORM.windup,
          remaining: 1, damage: THUNDERSTORM.damage[source.star - 1] * source.skillPower,
          from: { x: source.x, y: source.y }, to: { x: target.x, y: target.y } };
        effect(ctx, source, target, "windup", 1, THUNDERSTORM.name);
        break;
      }
      for (const enemy of enemies().filter(
        (f) => distance(f, target) <= s.radius,
      ))
        hit(enemy, enemy.uid === target.uid);
      break;
    case "thunderlord": {
      const visited = new Set<number>();
      let current: Fighter | undefined = target;
      let previous = source;
      for (let jump = 0; jump < 4 && current && source.hp > 0; jump++) {
        visited.add(current.uid);
        effect(ctx, previous, current, "chain", jump, "九霄连雷");
        damage(
          ctx,
          source,
          current,
          combatAttack(source, ctx.tick) *
            s.multiplier *
            source.skillPower *
            0.8 ** jump,
          "magic",
          true,
          jump === 0,
        );
        previous = current;
        current = enemies()
          .filter((f) => !visited.has(f.uid) && distance(f, previous) <= 3)
          .sort(
            (a, b) =>
              distance(a, previous) - distance(b, previous) || a.uid - b.uid,
          )[0];
      }
      break;
    }
    case "vine":
      if(source.thornbind){beginThornBind(ctx,source,target);break;}
      hit(target);
      stun(ctx, source, target, s.duration);
      break;
    case "bonedragon":
      if (source.boneblast && source.air) {
        source.air.cast = {kind:"boneblast",next:ctx.tick+BONEBLAST.windup,remaining:1,
          damage:combatAttack(source,ctx.tick)*BONEBLAST.multiplier*source.skillPower,
          from:{x:source.x,y:source.y},to:{x:target.x,y:target.y}};
        source.skillReadyAt=ctx.tick+BONEBLAST.cooldown;
        break;
      }
      for (const enemy of enemies().filter(
        (f) => distance(f, target) <= s.radius,
      )) {
        hit(enemy, enemy.uid === target.uid);
        stun(ctx, source, enemy, s.duration);
      }
      break;
    case "treant":
      if (source.jungle && source.air) {
        source.skillReadyAt = ctx.tick + JUNGLE.cooldown;
        source.air.cast = { kind: "jungle", next: ctx.tick + JUNGLE.windup, remaining: 1,
          target: target.uid, damage: JUNGLE.damage[source.star - 1] * source.skillPower,
          from: { x: source.x, y: source.y }, to: { x: source.x, y: source.y } };
        break;
      }
      shield(ctx, source, 0.2, 16);
      for (const enemy of enemies().filter(
        (f) => distance(f, source) <= s.radius,
      )) {
        hit(enemy, enemy.uid === target.uid);
        stun(ctx, source, enemy, s.duration);
      }
      break;
    case "repair": {
      const ally = ctx.fighters
        .filter(
          (f) =>
            f.hp > 0 &&
            !isUndying(f) &&
            f.side === source.side &&
            distance(source, f) <= 4,
        )
        .sort(
          (a, b) =>
            combatAttack(b, ctx.tick) - combatAttack(a, ctx.tick) ||
            a.uid - b.uid,
        )[0];
      if (ally) {
        heal(ctx, source, ally, source.maxHp * 0.25 * source.skillPower);
        const ratio = (15 + source.star * 10) / 100;
        if (ally.attackBoost && ally.attackBoost.until <= ctx.tick)
          delete ally.attackBoost;
        ally.attackBoost = {
          until: Math.max(ally.attackBoost?.until ?? 0, ctx.tick + 16),
          ratio: Math.max(ally.attackBoost?.ratio ?? 0, ratio),
        };
        effect(ctx, source, ally, "haste", ratio * 100, "维修强化");
      }
      break;
    }
    case "ghostjet":
      hit(target);
      if (source.air) source.air.phaseUntil = ctx.tick + 8;
      break;
    case "skycrab": {
      if (source.aurora) {
        source.skillReadyAt = ctx.tick + AURORA.cooldown;
        effect(ctx, source, target, "pulse", 1, AURORA.name);
        damage(
          ctx,
          source,
          target,
          AURORA.damage[source.star - 1] * source.skillPower,
          "magic",
          true,
        );
        if (source.aurora.stacks < AURORA.maxStacks) {
          source.aurora.stacks++;
          effect(
            ctx,
            source,
            source,
            "haste",
            source.aurora.stacks * AURORA.attackPerStack * 100,
            "极光增幅",
          );
        }
        break;
      }
      const victim = enemies()
        .filter((f) => distance(source, f) <= source.range)
        .sort(
          (a, b) =>
            combatAttack(b, ctx.tick) - combatAttack(a, ctx.tick) ||
            a.uid - b.uid,
        )[0];
      if (victim) hit(victim);
      break;
    }
    case "bomber":
    case "ark":
    case "eel":
      if (source.bombardment && source.air) {
        source.skillReadyAt = ctx.tick + BOMBARDMENT.cooldown[source.star - 1];
        source.air.cast = { kind: "bombardment", next: ctx.tick + BOMBARDMENT.windup,
          remaining: 1, damage: BOMBARDMENT.damage[source.star - 1] * source.skillPower,
          from: { x: source.x, y: source.y }, to: { x: target.x, y: target.y } };
        break;
      }
      if (source.air) {
        if (source.defId === "bomber") fortify(ctx, source, source, 8, 12);
        source.air.cast = {
          kind: source.defId,
          next: ctx.tick + (source.defId === "ark" ? 4 : 1),
          remaining: source.defId === "ark" ? 1 : 3,
          damage:
            combatAttack(source, ctx.tick) * s.multiplier * source.skillPower,
          from: { x: source.x, y: source.y },
          to: { x: target.x, y: target.y },
        };
      }
      break;
    case "eyebug":
      if(source.gaze){applyGaze(ctx,source,target);break;}
      hit(target);
      stun(ctx, source, target, 6);
      break;
    case "spider":
      if (source.charmCast) {
        interruptAirSkill(ctx, target);
        target.charm = {
          until: ctx.tick + (source.star + 1) * 4,
          attack: target.attack,
          side: target.side,
        };
        target.side = source.side;
        target.attack *= 1.2;
        source.charmCast = "spent";
      }
      break;
    case "wasp":
      if(source.hive){beginHiveCast(ctx,source);break;}
      for (const f of enemies().filter((f) => distance(source, f) <= s.radius))
        hit(f, f.uid === target.uid);
      break;
    case "cavalry":
      hit(target);
      stun(ctx, source, target, 2);
      break;
    case "dragonfly":
      hit(target);
      target.mana = 0;
      target.manaLockUntil = ctx.tick + s.duration;
      effect(ctx, source, target, "silence", s.duration / 4, "能量封锁");
      break;
    case "shadowblade":
      shield(ctx, source, s.shieldRatio, s.duration);
      for (const f of enemies().filter((f) => distance(source, f) <= s.radius))
        hit(f, f.uid === target.uid);
      break;
    case "turtle":
      if (source.signature) {
        const duration = (4 + source.star * 4) * 4;
        source.signature.carapace = {
          start: ctx.tick,
          until: ctx.tick + duration,
        };
        effect(ctx, source, source, "fortify", 12, "玄甲渐减");
      } else fortify(ctx, source, source, 12, s.duration);
      break;
    case "tiger":
      for (const f of enemies().filter((f) => distance(target, f) <= s.radius))
        hit(f, f.uid === target.uid, 0.3);
      break;
    case "bull":
      for (const f of enemies().filter(
        (f) => distance(source, f) <= s.radius,
      )) {
        hit(f, f.uid === target.uid);
        stun(ctx, source, f, 4);
      }
      break;
    case "fish":
      for (const ally of ctx.fighters.filter(
        (f) =>
          f.side === source.side && f.hp > 0 && distance(source, f) <= s.radius,
      )) {
        ally.stunUntil = 0;
        delete ally.thornRoot;
        delete ally.gazed;
        ally.armorBreak = 0;
        ally.armorBreakUntil = 0;
        delete ally.corrosion;
        delete ally.knockup;
        delete ally.jungleLandings;
        delete ally.taunt;
        ally.manaLockUntil = 0;
        delete ally.silenceUntil;
        effect(ctx, source, ally, "cleanse", 0, "驱散");
        heal(ctx, source, ally, source.maxHp * s.healRatio * source.skillPower);
      }
      break;
    case "deer":
      for (const ally of ctx.fighters
        .filter(
          (f) =>
            f.side === source.side &&
            f.hp > 0 &&
            !isUndying(f) &&
            distance(source, f) <= s.radius,
        )
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.uid - b.uid)
        .slice(0, 2)) {
        shield(ctx, source, s.shieldRatio, s.duration, ally);
        fortify(ctx, source, ally, 6, s.duration);
        heal(ctx, source, ally, source.maxHp * s.healRatio * source.skillPower);
      }
      break;
    case "infantry":
      breakArmor(ctx, source, target);
      hit(target);
      break;
    case "guard":
      shield(ctx, source, s.shieldRatio, s.duration);
      hit(target);
      stun(ctx, source, target, 4);
      break;
    case "pangolin":
      if (source.burrowSkill) {
        source.skillReadyAt = ctx.tick + PANGOLIN_BURROW.cooldown;
        damage(
          ctx,
          source,
          target,
          PANGOLIN_BURROW.damage[source.star - 1] * source.skillPower,
          "magic",
          true,
        );
        if (
          target.hp > 0 &&
          !isUndying(target) &&
          !isPhoenixEgg(target) &&
          !bladeStormActive(target, ctx.tick)
        ) {
          stun(ctx, source, target, PANGOLIN_BURROW.knockupTicks, "击飞");
          target.knockup = {
            start: ctx.tick,
            until: ctx.tick + PANGOLIN_BURROW.knockupTicks,
          };
        }
        effect(ctx, source, target, "pulse", 1, "遁地");
        break;
      }
      for (const f of enemies().filter(
        (f) => distance(target, f) <= s.radius,
      )) {
        breakArmor(ctx, source, f);
        hit(f, f.uid === target.uid);
      }
      break;
    case "panda":
      if (source.shuriken) return beginShuriken(ctx,source,target);
      hit(target);
      break;
    case "wolf": {
      const amount = hit(target);
      heal(ctx, source, source, amount * s.healRatio);
      break;
    }
    case "sniper":
      for (const f of lineTargets(source, target, ctx.fighters))
        hit(f, f.uid === target.uid, 0.5);
      break;
    case "chariot":
      for (const f of enemies().filter((f) => distance(target, f) <= s.radius))
        hit(f, f.uid === target.uid);
      break;
    case "lion":
      if (source.warcry && source.air) {
        source.skillReadyAt=ctx.tick+WARCRY.cooldown;
        source.air.cast={kind:"warcry",next:ctx.tick+WARCRY.windup,remaining:1,
          damage:WARCRY.damage[source.star-1]*source.skillPower,
          from:{x:source.x,y:source.y},to:{x:target.x,y:target.y}};
        break;
      }
      shield(ctx, source, s.shieldRatio, s.duration);
      for (const f of ctx.fighters.filter(
        (f) =>
          f.side === source.side && f.hp > 0 && distance(source, f) <= s.radius,
      )) {
        f.hasteUntil = ctx.tick + s.duration;
        effect(ctx, source, f, "haste", s.duration / 4, "怒吼加速");
      }
      break;
    case "monk":
      if (source.secretOrb) return beginSecretOrb(ctx,source,target);
      for (const f of ctx.fighters
        .filter(
          (f) =>
            f.side === source.side &&
            f.hp > 0 &&
            f.hp < f.maxHp &&
            distance(source, f) <= s.radius,
        )
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.uid - b.uid)
        .slice(0, 3))
        heal(ctx, source, f, source.maxHp * s.healRatio * source.skillPower);
      break;
    case "cannon":
      for (const f of lineTargets(source, target, ctx.fighters)) {
        hit(f, f.uid === target.uid);
        f.mana = Math.max(0, f.mana - 30);
      }
      break;
    case "master": {
      if (source.wushi) return beginWushi(ctx, source);
      const targets = enemies().filter((f) => distance(source, f) <= s.radius);
      for (const f of targets) {
        hit(f, f.uid === target.uid);
        if (f.hp <= 0 || bladeStormActive(f, ctx.tick)) continue;
        const dx = f.x - source.x,
          dy = f.y - source.y;
        const next = {
          x: f.x + (Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0),
          y: f.y + (Math.abs(dx) < Math.abs(dy) ? Math.sign(dy) : 0),
        };
        if (
          next.x < 0 ||
          next.x > 7 ||
          next.y < 0 ||
          next.y > 7 ||
          ctx.fighters.some((e) => e.hp > 0 && e.x === next.x && e.y === next.y)
        )
          continue;
        const from = { x: f.x, y: f.y };
        f.x = next.x;
        f.y = next.y;
        ctx.effects.push({
          source: source.uid,
          target: f.uid,
          kind: "knockback",
          amount: 1,
          name: "击退",
          from,
          to: next,
        });
      }
      break;
    }
    case "titan":
      if (source.terminator && source.air) {
        source.skillReadyAt = ctx.tick + TERMINATOR.cooldown[source.star - 1];
        source.air.cast = { kind: "terminator", next: ctx.tick + TERMINATOR.windup,
          remaining: 2, damage: TERMINATOR.smallDamage[source.star - 1] * source.skillPower,
          secondaryDamage: TERMINATOR.largeDamage[source.star - 1] * source.skillPower,
          from: { x: source.x, y: source.y }, to: { x: target.x, y: target.y } };
        break;
      }
      for (const f of enemies().filter(
        (f) => distance(target, f) <= s.radius,
      )) {
        hit(f, f.uid === target.uid);
        stun(ctx, source, f, 6);
      }
      break;
  }
  return true;
}
