import { skillReady, usesEnergy, effectiveArmor } from "./triggers";
import { SKILLS } from "../data/skills";
import type { CombatEffect, CombatEvent, DamageType, Fighter } from "./types";

export const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const attackInterval = (f: Fighter, tick: number) =>
  Math.max(1, f.interval * (f.hasteUntil > tick ? 0.7 : 1));
export function gainMana(f: Fighter, amount: number, tick: number) {
  if (usesEnergy(f) && f.hp > 0 && f.manaLockUntil <= tick)
    f.mana = Math.min(100, f.mana + amount);
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
) {
  if (source.hp <= 0 || target.hp <= 0) return 0;
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
  // Preserve the historical lethal-hit energy value for old replay snapshots.
  if (usesEnergy(target) && target.manaLockUntil <= ctx.tick)
    target.mana = Math.min(100, target.mana + 10);
  ctx.events.push({
    attacker: source.uid,
    target: target.uid,
    amount,
    absorbed,
    damageType: type,
    skill,
    primary,
    ranged: source.range > 1,
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
  return amount;
}
export function heal(
  ctx: CombatContext,
  source: Fighter,
  target: Fighter,
  amount: number,
) {
  if (target.hp <= 0) return;
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
  if (target.hp <= 0) return;
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
export function castSkill(
  ctx: CombatContext,
  source: Fighter,
  target: Fighter,
) {
  const s = SKILLS[source.defId];
  if (!s || source.hp <= 0 || !skillReady(source) || target.hp <= 0)
    return false;
  if (source.defId === "panda" || source.defId === "wolf") {
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
      source.attack * s.multiplier * source.skillPower,
      s.damageType,
      true,
      primary,
      penetration,
    );
  switch (source.defId) {
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
        if (f.hp <= 0) continue;
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
