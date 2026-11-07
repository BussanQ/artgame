import { BLADE_STORM } from "../data/skills";
import { damage, type CombatContext } from "./abilities";
import type { Fighter } from "./types";

export function bladeStormActive(f: Fighter, tick: number): boolean {
  return f.hp > 0 && !!f.bladeStorm && f.bladeStorm.until > tick;
}

export function startBladeStorm(ctx: CombatContext, f: Fighter) {
  f.skillReadyAt = ctx.tick + BLADE_STORM.cooldown;
  f.bladeStorm = {
    until: ctx.tick + BLADE_STORM.duration,
    next: ctx.tick + BLADE_STORM.pulseInterval,
    remaining: BLADE_STORM.pulses,
    damage: BLADE_STORM.damage[f.star - 1] * f.skillPower,
  };
  // Existing attack slow does not linger beneath the immunity window.
  delete f.slow;
  delete f.attackSlows;
}

/** Pulses follow the moving caster; no repeated cast counters or posthumous damage. */
export function advanceBladeStorm(ctx: CombatContext, f: Fighter): boolean {
  const state = f.bladeStorm;
  if (!state) return false;
  if (!bladeStormActive(f, ctx.tick) || f.charm) {
    delete f.bladeStorm;
    return false;
  }
  if (state.remaining > 0 && state.next <= ctx.tick) {
    ctx.effects.push({
      source: f.uid,
      target: f.uid,
      kind: "pulse",
      name: "狂舞花绽",
      amount: BLADE_STORM.radius,
      from: { x: f.x, y: f.y },
      to: { x: f.x, y: f.y },
    });
    for (const target of ctx.fighters.filter(
      (target) =>
        target.hp > 0 &&
        target.side !== f.side &&
        Math.hypot(target.x - f.x, target.y - f.y) <= BLADE_STORM.radius,
    )) {
      damage(ctx, f, target, state.damage, "magic", true, false);
      if (f.hp <= 0 || f.bladeStorm !== state) break;
    }
    state.remaining--;
    state.next += BLADE_STORM.pulseInterval;
  }
  return bladeStormActive(f, ctx.tick);
}
