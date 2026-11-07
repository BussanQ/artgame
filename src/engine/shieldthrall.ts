import { SHIELD_WAVE } from "../data/skills";
import { damage, type CombatContext } from "./abilities";
import { silence } from "./infantry-skills";
import { isUndying } from "./immortality";
import type { Fighter } from "./types";

type Point = { x: number; y: number };
/** Forward-only rectangle; source cell and side/back cells are excluded. */
export function shieldWaveCells(from: Point, to: Point): Point[] {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    length = Math.hypot(dx, dy);
  if (!length) return [];
  const ux = dx / length,
    uy = dy / length,
    cells: Point[] = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const rx = x - from.x,
        ry = y - from.y;
      const forward = rx * ux + ry * uy,
        side = Math.abs(rx * uy - ry * ux);
      if (
        forward > 1e-9 &&
        forward <= SHIELD_WAVE.depth + 1e-9 &&
        side <= SHIELD_WAVE.halfWidth + 1e-9
      )
        cells.push({ x, y });
    }
  return cells;
}

/** Instant committed wave, not a displacement or a channel. */
export function releaseShieldWave(
  ctx: CombatContext,
  source: Fighter,
  target: Fighter,
) {
  source.skillReadyAt = ctx.tick + SHIELD_WAVE.cooldown;
  const cells = new Set(
    shieldWaveCells(source, target).map((p) => `${p.x},${p.y}`),
  );
  const raw = SHIELD_WAVE.damage[source.star - 1] * source.skillPower;
  ctx.effects.push({
    source: source.uid,
    target: target.uid,
    kind: "pulse",
    name: "正义冲锋",
    amount: SHIELD_WAVE.depth,
    from: { x: source.x, y: source.y },
    to: { x: target.x, y: target.y },
  });
  for (const enemy of ctx.fighters.filter(
    (f) => f.hp > 0 && f.side !== source.side && cells.has(`${f.x},${f.y}`),
  )) {
    if (source.hp <= 0) break;
    damage(ctx, source, enemy, raw, "magic", true, enemy.uid === target.uid);
    if (!isUndying(enemy))
      silence(ctx, source, enemy, SHIELD_WAVE.silenceTicks);
  }
}
