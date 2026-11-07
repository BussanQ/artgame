import { gainMana, type CombatContext } from "./abilities";
import { GOSPEL } from "../data/skills";
import { usesEnergy } from "./triggers";
import { isUndying } from "./immortality";
import { isPhoenixEgg } from "./phoenix";
import type { Fighter } from "./types";

/** A passive field remains during stun/silence, but not after death or during charm. */
export function gospelActive(f: Fighter) {
  return !!f.gospelAura && f.hp > 0 && !f.charm && !f.summon &&
    !isUndying(f) && !isPhoenixEgg(f);
}
export function inGospelField(
  source: Pick<Fighter, "x" | "y">,
  target: Pick<Fighter, "x" | "y">,
) {
  return (source.x - target.x) ** 2 + (source.y - target.y) ** 2 <=
    GOSPEL.radius ** 2;
}
/** One shared one-second cadence prevents overlapping fields multiplying recovery events. */
export function advanceGospel(ctx: CombatContext) {
  if (ctx.tick < GOSPEL.interval || ctx.tick % GOSPEL.interval !== 0) return;
  const sources = ctx.fighters.filter(gospelActive).sort(
    (a, b) => b.star - a.star || a.uid - b.uid,
  );
  if (!sources.length) return;
  for (const source of sources) {
    source.gospelAura!.pulses++;
    source.gospelAura!.lastTick = ctx.tick;
    source.gospelAura!.targets = [];
  }
  for (const target of ctx.fighters) {
    if (target.hp <= 0 || !usesEnergy(target) || target.mana >= 100 ||
      target.manaLockUntil > ctx.tick) continue;
    const source = sources.find((f) => f.side === target.side && inGospelField(f, target));
    if (!source) continue;
    const before = target.mana;
    gainMana(target, GOSPEL.energy[source.star - 1], ctx.tick);
    const amount = target.mana - before;
    if (amount <= 0) continue;
    const field = source.gospelAura!;
    field.targets.push(target.uid);
    field.peakTargets = Math.max(field.peakTargets, field.targets.length);
    ctx.effects.push({
      source: source.uid,
      target: target.uid,
      kind: "energize",
      amount,
      name: GOSPEL.name,
      from: { x: source.x, y: source.y },
      to: { x: target.x, y: target.y },
    });
  }
}
