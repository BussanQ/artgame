import type { Fighter } from "./types";
import type { CombatContext } from "./abilities";

/** hp=1 keeps an active soul in targeting and occupancy; it is not restored life. */
export const isUndying = (fighter: Fighter) =>
  !!fighter.immortal?.spent && fighter.hp > 0;
export function enterUndying(ctx: CombatContext, fighter: Fighter) {
  const state = fighter.immortal;
  if (!state || state.spent || fighter.hp > 0) return false;
  state.spent = true;
  state.until = ctx.tick + state.duration;
  fighter.hp = 1;
  fighter.shield = 0;
  ctx.effects.push({
    source: fighter.uid,
    target: fighter.uid,
    kind: "immortal",
    amount: state.duration / 4,
    name: "不朽觉醒",
    from: { x: fighter.x, y: fighter.y },
    to: { x: fighter.x, y: fighter.y },
  });
  return true;
}
export function expireUndying(ctx: CombatContext) {
  for (const fighter of ctx.fighters) {
    if (!isUndying(fighter) || fighter.immortal!.until > ctx.tick) continue;
    fighter.hp = 0;
    fighter.shield = 0;
    if (fighter.air) delete fighter.air.cast;
    ctx.effects.push({
      source: fighter.uid,
      target: fighter.uid,
      kind: "immortal",
      amount: 0,
      name: "残魂消散",
      from: { x: fighter.x, y: fighter.y },
      to: { x: fighter.x, y: fighter.y },
    });
  }
}
