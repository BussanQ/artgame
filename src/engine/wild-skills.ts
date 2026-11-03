import { damage, type CombatContext } from "./abilities";
import type { Fighter } from "./types";

/** A committed sonic curse keeps ticking after its caster dies; source damage is frozen at cast. */
export function advanceSonic(ctx: CombatContext) {
  for (const target of ctx.fighters) {
    if (!target.sonic) continue;
    if (target.hp <= 0) {
      delete target.sonic;
      continue;
    }
    const dots = target.sonic;
    for (const dot of dots) {
      if (dot.next > ctx.tick || dot.remaining <= 0) continue;
      const source = ctx.fighters.find((f) => f.uid === dot.source);
      if (!source) {
        dot.remaining = 0;
        continue;
      }
      damage(
        ctx,
        source,
        target,
        dot.damage,
        "magic",
        true,
        false,
        0,
        false,
        false,
        true,
      );
      ctx.effects.push({
        source: source.uid,
        target: target.uid,
        kind: "sonic",
        name: "震魂声波",
        amount: 1,
        from: { x: source.x, y: source.y },
        to: { x: target.x, y: target.y },
      });
      dot.remaining--;
      dot.next += 4;
      // A lethal hit may transform the target and cleanse the entire status list.
      // Do not apply remaining old-body curses to its new body or restore the list.
      if (target.hp <= 0 || target.sonic !== dots) break;
    }
    if (target.sonic !== dots) continue;
    target.sonic = dots.filter((dot) => dot.remaining > 0);
    if (!target.sonic.length || target.hp <= 0) delete target.sonic;
  }
}

/** Locked target, no retarget or refund. Ordinary attack cooldown continues during the charge. */
export function advanceWindup(ctx: CombatContext, source: Fighter): boolean {
  const cast = source.windup;
  if (!cast) return false;
  if (source.hp <= 0 || source.charm || source.stunUntil > ctx.tick) {
    delete source.windup;
    ctx.effects.push({
      source: source.uid,
      target: source.uid,
      kind: "silence",
      amount: 0,
      name: "施法中断",
      from: { x: source.x, y: source.y },
      to: { x: source.x, y: source.y },
    });
    return true;
  }
  if (cast.until > ctx.tick) return true;
  delete source.windup;
  const target = ctx.fighters.find(
    (f) => f.uid === cast.target && f.hp > 0 && f.side !== source.side,
  );
  if (target) damage(ctx, source, target, cast.damage, "true", true);
  return true;
}
