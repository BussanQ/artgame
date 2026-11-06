import { THUNDERSTORM } from "../data/skills";
import { damage, type CombatContext } from "./abilities";
import { usesEnergy } from "./triggers";
import { isUndying } from "./immortality";
import { isPhoenixEgg } from "./phoenix";
import type { Fighter } from "./types";

type Point = { x: number; y: number };
/** Swept circle prevents fast bolts skipping targets between simulation steps. */
export function stormContact(from: Point, to: Point, target: Point) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = dx * dx + dy * dy;
  const along = length ? Math.max(0, Math.min(1,
    ((target.x - from.x) * dx + (target.y - from.y) * dy) / length)) : 0;
  return Math.hypot(target.x - from.x - dx * along,
    target.y - from.y - dy * along) <= THUNDERSTORM.width / 2 + 1e-9
    ? along : null;
}
export function releaseStorm(source: Fighter) {
  const cast = source.air?.cast;
  if (!source.storm || cast?.kind !== "storm") return;
  const dx = cast.to.x - cast.from.x, dy = cast.to.y - cast.from.y;
  const length = Math.hypot(dx, dy);
  delete source.air!.cast;
  if (!length) return;
  source.storm.launched++;
  source.storm.bolts.push({ x: cast.from.x, y: cast.from.y,
    dx: dx / length, dy: dy / length, traveled: 0, damage: cast.damage,
    side: source.side, hit: [] });
}
/** Already launched projectiles keep their allegiance and finish even after their caster dies. */
export function advanceStormBolts(ctx: CombatContext) {
  for (const source of ctx.fighters) {
    const storm = source.storm;
    if (!storm) continue;
    storm.bolts = storm.bolts.filter((bolt) => {
      const step = Math.min(THUNDERSTORM.speed, THUNDERSTORM.range - bolt.traveled);
      const from = { x: bolt.x, y: bolt.y };
      const to = { x: from.x + bolt.dx * step, y: from.y + bolt.dy * step };
      const contacts = ctx.fighters.filter((f) =>
        f.hp > 0 && f.side !== bolt.side && !bolt.hit.includes(f.uid),
      ).map((target) => ({ target, along: stormContact(from, to, target) }))
        .filter((entry) => entry.along !== null)
        .sort((a, b) => a.along! - b.along! || a.target.uid - b.target.uid);
      for (const { target } of contacts) {
        if (target.hp <= 0 || target.side === bolt.side) continue;
        bolt.hit.push(target.uid);
        storm.hits++;
        const shield = target.shield;
        const hurt = damage(ctx, source, target, bolt.damage, "magic", true,
          true, 0, false, false, false, false, 0, true);
        if (!(hurt > 0 || target.shield < shield) || target.hp <= 0 ||
          isUndying(target) || isPhoenixEgg(target) || !usesEnergy(target)) continue;
        const removed = Math.min(THUNDERSTORM.drain, target.mana);
        if (removed <= 0) continue;
        target.mana -= removed;
        storm.energyRemoved += removed;
        ctx.effects.push({ source: source.uid, target: target.uid, kind: "drain",
          name: "雷暴削能", amount: removed, from, to: { x: target.x, y: target.y } });
      }
      bolt.x = to.x;
      bolt.y = to.y;
      bolt.traveled += step;
      return bolt.traveled < THUNDERSTORM.range &&
        bolt.x >= -0.5 && bolt.x <= 7.5 && bolt.y >= -0.5 && bolt.y <= 7.5;
    });
  }
}
