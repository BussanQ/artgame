import { damage, type CombatContext } from "./abilities";
import { isPhoenixEgg } from "./phoenix";
import type { Fighter } from "./types";

/** Heading-aligned cone: depth <=3, half-width grows at 0.65 per tile, capped at 1.5. */
export function flameCells(
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    length = Math.hypot(dx, dy);
  if (!length) return [];
  const ux = dx / length,
    uy = dy / length,
    cells: { x: number; y: number }[] = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const rx = x - from.x,
        ry = y - from.y,
        forward = rx * ux + ry * uy,
        side = Math.abs(rx * uy - ry * ux);
      if (
        forward > 0 &&
        forward <= 3 + 1e-9 &&
        side <= Math.min(1.5, forward * 0.65) + 1e-9
      )
        cells.push({ x, y });
    }
  return cells;
}
export function ignite(
  ctx: CombatContext,
  source: Fighter,
  target: Fighter,
  amount: number,
) {
  if (target.hp <= 0 || isPhoenixEgg(target)) return;
  target.burn = (target.burn ?? []).filter((d) => d.source !== source.uid);
  target.burn.push({
    source: source.uid,
    next: ctx.tick + 4,
    remaining: 3,
    damage: amount,
  });
}
/** Committed burns survive the caster; each caster refreshes only its own application. */
export function advanceBurn(ctx: CombatContext) {
  for (const target of ctx.fighters) {
    if (!target.burn) continue;
    if (target.hp <= 0 || isPhoenixEgg(target)) {
      delete target.burn;
      continue;
    }
    const dots = target.burn;
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
        kind: "burn",
        name: "灼烧",
        amount: 1,
        from: { x: target.x, y: target.y },
        to: { x: target.x, y: target.y },
      });
      dot.remaining--;
      dot.next += 4;
      if (target.hp <= 0 || target.burn !== dots) break;
    }
    if (target.burn !== dots) continue;
    target.burn = dots.filter((d) => d.remaining > 0);
    if (!target.burn.length || target.hp <= 0) delete target.burn;
  }
}
export function silence(
  ctx: CombatContext,
  source: Fighter,
  target: Fighter,
  ticks: number,
) {
  if (target.hp <= 0 || isPhoenixEgg(target)) return;
  target.silenceUntil = Math.max(target.silenceUntil ?? 0, ctx.tick + ticks);
  // Active channels stop immediately; ordinary attacks (including claw combos) continue.
  if (target.air) delete target.air.cast;
  delete target.windup;
  ctx.effects.push({
    source: source.uid,
    target: target.uid,
    kind: "silence",
    name: "沉默",
    amount: ticks / 4,
    from: { x: source.x, y: source.y },
    to: { x: target.x, y: target.y },
  });
}
