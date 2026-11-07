import { WILDFIRE } from "../data/skills";
import { damage, interruptAirSkill, type CombatContext } from "./abilities";
import { isUndying } from "./immortality";
import { isPhoenixEgg, phoenixFlameCells } from "./phoenix";
import type { Fighter } from "./types";

/** Apportion the rounded cast budget without losing points to per-pulse rounding. */
export function wildfirePulseDamage(total: number, index: number, pulses: number) {
  return Math.round(total * (index + 1) / pulses) - Math.round(total * index / pulses);
}
export function beginWildfire(ctx: CombatContext, source: Fighter, target: Fighter) {
  if (!source.wildfire) return;
  source.wildfire.casting = {
    start: ctx.tick, until: ctx.tick + WILDFIRE.windup,
    from: { x: source.x, y: source.y }, to: { x: target.x, y: target.y },
    damage: WILDFIRE.damage[source.star - 1] * source.skillPower, side: source.side,
  };
  source.skillReadyAt = ctx.tick + WILDFIRE.cooldown;
}
function interrupted(source: Fighter, tick: number) {
  return source.hp <= 0 || !!source.charm || source.stunUntil > tick ||
    (source.silenceUntil ?? 0) > tick || isUndying(source) || isPhoenixEgg(source);
}
export function expireWildfires(ctx: CombatContext) {
  for (const source of ctx.fighters) {
    const state = source.wildfire;
    if (!state) continue;
    if (state.channel && state.channel.until < ctx.tick) delete state.channel;
    if ((state.casting || state.channel) && interrupted(source, ctx.tick))
      interruptAirSkill(ctx, source);
  }
}
/** Forming and maintaining the flame consumes the caster's action. */
export function advanceWildfireAction(ctx: CombatContext, source: Fighter) {
  const state = source.wildfire;
  if (!state) return false;
  const occupied = !!(state.casting || state.channel);
  expireWildfires(ctx);
  if (state.channel) return true;
  const cast = state.casting;
  if (!cast) return occupied;
  if (cast.until > ctx.tick) return true;
  delete state.casting;
  state.formed++;
  const duration = WILDFIRE.duration[source.star - 1];
  state.channel = { ...cast, start: ctx.tick, until: ctx.tick + duration,
    nextIndex: 0, totalPulses: duration / WILDFIRE.pulseInterval };
  return true;
}
/** Current occupancy and mitigation on every pulse; no lingering debuff follows a fleeing unit. */
export function advanceWildfirePulses(ctx: CombatContext) {
  expireWildfires(ctx);
  for (const source of ctx.fighters) {
    const state = source.wildfire, flame = state?.channel;
    if (!state || !flame || flame.nextIndex >= flame.totalPulses ||
      flame.start + (flame.nextIndex + 1) * WILDFIRE.pulseInterval > ctx.tick) continue;
    const amount = wildfirePulseDamage(flame.damage, flame.nextIndex++, flame.totalPulses);
    state.pulses++;
    ctx.effects.push({ source: source.uid, target: source.uid, kind: "pulse", name: "燎原烈焰",
      amount: source.star, from: { ...flame.from }, to: { ...flame.to } });
    const cells = phoenixFlameCells(flame.from, flame.to);
    for (const target of ctx.fighters.filter(f => f.hp > 0 && f.side !== flame.side &&
      cells.some(cell => cell.x === f.x && cell.y === f.y)).sort((a, b) => a.uid - b.uid)) {
      // Reflection may kill/transform the caster in the middle of this same pulse.
      if (state.channel !== flame || interrupted(source, ctx.tick)) break;
      if (target.hp <= 0 || target.side === flame.side) continue;
      const shield = target.shield;
      const hurt = damage(ctx, source, target, amount, "magic", true, false, 0, false, false, true);
      if (hurt > 0 || target.shield < shield) state.hits++;
    }
    if (flame.nextIndex >= flame.totalPulses && state.channel === flame) delete state.channel;
  }
  expireWildfires(ctx);
}
