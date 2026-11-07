import { TERMINATOR } from "../data/skills";
import { damage, type CombatContext } from "./abilities";
import type { Fighter } from "./types";

type Point = { x: number; y: number };
export const terminatorContains = (center: Point, target: Point) =>
  Math.hypot(target.x - center.x, target.y - center.y) <= TERMINATOR.radius + 1e-9;

/** The shared casting state validates interruption before each individual launch. */
export function launchTerminator(ctx: CombatContext, source: Fighter) {
  const state = source.terminator, cast = source.air?.cast;
  if (!state || cast?.kind !== "terminator") return;
  const small = cast.remaining === 2;
  state[small ? "smallLaunched" : "largeLaunched"]++;
  state.missiles.push({ kind: small ? "small" : "large", start: ctx.tick,
    landAt: ctx.tick + TERMINATOR.flight, from: { x: source.x, y: source.y },
    to: { ...cast.to }, damage: small ? cast.damage : cast.secondaryDamage!, side: source.side });
  if (--cast.remaining === 0) delete source.air!.cast;
  else cast.next += TERMINATOR.launchInterval;
}

/** Each released missile is a separate, committed area hit. Its caster's later
 * death or allegiance change cannot erase the impact or re-aim the fixed center. */
export function advanceTerminatorMissiles(ctx: CombatContext) {
  for (const source of ctx.fighters) {
    const state = source.terminator;
    if (!state) continue;
    state.missiles = state.missiles.filter(missile => {
      if (missile.landAt > ctx.tick) return true;
      state.detonated++;
      ctx.effects.push({ source: source.uid, target: source.uid, kind: "pulse",
        name: missile.kind === "small" ? "终结者小弹" : "终结者大弹",
        amount: TERMINATOR.radius, from: { ...missile.from }, to: { ...missile.to } });
      for (const target of ctx.fighters.filter(f => f.hp > 0 && f.side !== missile.side &&
        terminatorContains(missile.to, f)).sort((a, b) => a.uid - b.uid)) {
        if (target.hp <= 0 || target.side === missile.side) continue;
        const shield = target.shield;
        const hurt = damage(ctx, source, target, missile.damage, "magic", true,
          false, 0, false, false, false, false, 0, true);
        if (hurt > 0 || target.shield < shield) state.hits++;
      }
      return false;
    });
  }
}
