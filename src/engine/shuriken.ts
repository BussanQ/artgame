import { SHURIKEN } from "../data/skills";
import { damage, type CombatContext } from "./abilities";
import type { Fighter } from "./types";

export function shurikenContains(
  field: { x: number; y: number; radius: number },
  target: { x: number; y: number },
) {
  return Math.hypot(target.x - field.x, target.y - field.y) <= field.radius + 1e-9;
}

export function beginShuriken(ctx: CombatContext, source: Fighter, target: Fighter) {
  const state = source.shuriken;
  if (!state) return false;
  state.casting = { start: ctx.tick, until: ctx.tick + SHURIKEN.windup,
    from: { x: source.x, y: source.y }, to: { x: target.x, y: target.y },
    damage: SHURIKEN.damage[source.star - 1] * source.skillPower,
    radius: SHURIKEN.radius[source.star - 1], side: source.side };
  source.skillReadyAt = ctx.tick + SHURIKEN.cooldown;
  return true;
}

/** Only startup can be interrupted. Flight and area damage are already committed. */
export function expireShurikenCasts(ctx: CombatContext) {
  for (const source of ctx.fighters) {
    if (!source.shuriken?.casting || !(source.hp <= 0 || source.charm ||
      source.stunUntil > ctx.tick || (source.silenceUntil ?? 0) > ctx.tick)) continue;
    delete source.shuriken.casting;
    source.shuriken.interrupted++;
    ctx.effects.push({ source: source.uid, target: source.uid, kind: "silence",
      name: "飞镖蓄力中断", amount: 0.25,
      from: { x: source.x, y: source.y }, to: { x: source.x, y: source.y } });
  }
}

export function advanceShurikenCast(ctx: CombatContext, source: Fighter) {
  const cast = source.shuriken?.casting;
  if (!cast) return false;
  expireShurikenCasts(ctx);
  if (!source.shuriken!.casting) return true;
  if (cast.until > ctx.tick) return true;
  delete source.shuriken!.casting;
  source.shuriken!.launched++;
  const flight = Math.max(1, Math.ceil(Math.hypot(
    cast.to.x - cast.from.x, cast.to.y - cast.from.y) / SHURIKEN.speed));
  source.shuriken!.blades.push({ ...cast, start: ctx.tick, until: ctx.tick + flight });
  return true;
}

/** Pulse against positions at that tick, including concealed enemies in the area.
 * A dead caster does not cancel a committed spell or extend a finished battle. */
export function advanceShurikenFields(ctx: CombatContext) {
  expireShurikenCasts(ctx);
  for (const source of ctx.fighters) {
    const state = source.shuriken;
    if (!state) continue;
    state.blades = state.blades.filter(blade => {
      if (blade.until > ctx.tick) return true;
      state.landings++;
      state.fields.push({ ...blade.to, start: ctx.tick, until: ctx.tick + SHURIKEN.duration,
        next: ctx.tick + SHURIKEN.pulseInterval, remaining: SHURIKEN.pulses,
        damage: blade.damage, radius: blade.radius, side: blade.side });
      return false;
    });
    state.fields = state.fields.filter(field => {
      if (field.until < ctx.tick) return false;
      if (field.remaining > 0 && field.next <= ctx.tick) {
        field.remaining--;
        field.next += SHURIKEN.pulseInterval;
        state.pulses++;
        for (const target of ctx.fighters.filter(f => f.hp > 0 &&
          f.side !== field.side && shurikenContains(field, f)).sort((a,b) => a.uid-b.uid)) {
          if (target.hp <= 0 || target.side === field.side) continue;
          const shield = target.shield;
          const hurt = damage(ctx, source, target, field.damage, "magic", true,
            false, 0, false, false, true, false, 0, true);
          if (hurt > 0 || target.shield < shield) state.hits++;
        }
      }
      return true;
    });
  }
}
