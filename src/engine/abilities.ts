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
import { SKILLS, HAWK_METAMORPH, AXE_THROW } from "../data/skills";
import { UNIT } from "../data/units";
import type { CombatEffect, CombatEvent, DamageType, Fighter } from "./types";

export const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const attackInterval = (f: Fighter, tick: number) =>
  Math.max(
    1,
    f.interval *
      (f.hasteUntil > tick ? 0.7 : 1) *
      (f.slow && f.slow.until > tick ? f.slow.multiplier : 1),
  );
export const combatAttack = (f: Fighter, tick: number) =>
  f.attack *
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
export function gainMana(f: Fighter, amount: number, tick: number) {
  if (usesEnergy(f) && f.hp > 0 && f.manaLockUntil <= tick)
    f.mana = Math.min(100, f.mana + amount * (f.energyMultiplier ?? 1));
}
export interface CombatContext {
  fighters: Fighter[];
  tick: number;
  events: CombatEvent[];
  effects: CombatEffect[];
}
function effect(
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
) {
  if (
    (source.hp <= 0 &&
      !reflected &&
      !periodic &&
      !(deathBurst && source.deathBurst === "spent")) ||
    target.hp <= 0
  )
    return 0;
  if (!skill && source.trueAttack) type = "true";
  if (!skill && source.groundBonus && !target.air?.flying)
    raw *= 1 + source.groundBonus;
  const reflectHit = () => {
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
      ...(!skill && source.hawkForm?.active
        ? { strike: 3 - (source.combo?.remaining ?? 2) }
        : {}),
      evaded: true,
      from: { x: source.x, y: source.y },
      to: { x: target.x, y: target.y },
    });
    return 0;
  }
  if (!skill && source.air) {
    if (source.air.antiAir && target.air?.flying) raw *= 1.5;
    if (
      target.summon
        ? target.summon.kind === "puppet"
        : UNIT[target.defId].traits.some((t) =>
            ["装甲", "空军", "傀儡", "海神", "异虫"].includes(t),
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
      effectiveArmor(target, ctx.tick) -
        (target.armorBreakUntil > ctx.tick ? target.armorBreak : 0),
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
    delete target.bladeStorm;
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
    target.mana = Math.min(
      100,
      target.mana + 10 * (target.energyMultiplier ?? 1),
    );
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
    ...(!skill && source.hawkForm?.active
      ? { strike: 3 - (source.combo?.remaining ?? 2) }
      : {}),
    from: { x: source.x, y: source.y },
    to: { x: target.x, y: target.y },
  });
  if (!skill && source.lifesteal > 0)
    heal(ctx, source, source, amount * source.lifesteal);
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
  if (target.hp === 0 && !enterPhoenixEgg(ctx, target))
    enterUndying(ctx, target);
  reflectHit();
  return amount;
}
export function heal(
  ctx: CombatContext,
  source: Fighter,
  target: Fighter,
  amount: number,
) {
  if (target.hp <= 0 || isUndying(target) || isPhoenixEgg(target)) return;
  const actual = Math.max(
    0,
    Math.min(target.maxHp - target.hp, Math.round(amount)),
  );
  if (!actual) return;
  target.hp += actual;
  source.healing += actual;
  effect(ctx, source, target, "heal", actual, "治疗");
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
function dashTo(ctx: CombatContext, source: Fighter, target: Fighter): boolean {
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
    name: "冲锋",
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
) {
  if (
    target.hp <= 0 ||
    isPhoenixEgg(target) ||
    bladeStormActive(target, ctx.tick)
  )
    return;
  interruptAirSkill(ctx, target);
  target.stunUntil = Math.max(target.stunUntil, ctx.tick + ticks + 1);
  effect(ctx, source, target, "stun", ticks / 4, "眩晕");
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
function interruptAirSkill(ctx: CombatContext, source: Fighter) {
  if (
    !source.air?.cast &&
    !source.windup &&
    !source.combo &&
    !source.bird?.draw
  )
    return;
  const wasDrawing = !!source.bird?.draw;
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
    (["irondog", "specialist", "ironape"].includes(pending.kind) &&
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
  const s = source.hawkForm ? HAWK_METAMORPH : SKILLS[source.defId];
  if (!s || source.hp <= 0 || !skillReady(source) || target.hp <= 0)
    return false;
  if ((source.silenceUntil ?? 0) > ctx.tick && usesEnergy(source)) return false;
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
    source.defId === "swordthrall" &&
    (source.stunUntil > ctx.tick ||
      (source.skillReadyAt ?? 0) > ctx.tick ||
      distance(source, target) > source.range ||
      !attackTargets(source, ctx.fighters, ctx.tick).some(
        (f) => f.uid === target.uid,
      ))
  )
    return false;
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
    const victim = ctx.fighters
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
    source.defId === "wasp" &&
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
    source.defId === "panda" ||
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
  if (source.defId === "ironrooster") target = source;
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
        kind: "motorcycle",
        next: ctx.tick + 2,
        remaining: 3,
        damage: 100 * 2 ** (source.star - 1) * source.skillPower,
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
          source.air.flying = false;
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
    case "skytoad":
      source.devourSpent = true;
      effect(ctx, source, target, "devour", 1, "吞云噬体");
      damage(ctx, source, target, target.hp + target.shield, "true", true);
      break;
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
      source.windup = {
        until: ctx.tick + 4,
        target: target.uid,
        damage:
          combatAttack(source, ctx.tick) * s.multiplier * source.skillPower,
      };
      effect(ctx, source, target, "windup", 1, "真言蓄力");
      break;
    case "winddragon":
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
      hit(target);
      stun(ctx, source, target, s.duration);
      break;
    case "bonedragon":
      for (const enemy of enemies().filter(
        (f) => distance(f, target) <= s.radius,
      )) {
        hit(enemy, enemy.uid === target.uid);
        stun(ctx, source, enemy, s.duration);
      }
      break;
    case "treant":
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
        ally.armorBreak = 0;
        ally.armorBreakUntil = 0;
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
      for (const f of enemies().filter(
        (f) => distance(target, f) <= s.radius,
      )) {
        breakArmor(ctx, source, f);
        hit(f, f.uid === target.uid);
      }
      break;
    case "panda":
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
