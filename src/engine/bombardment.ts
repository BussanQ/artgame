import { BOMBARDMENT } from "../data/skills";
import { damage, type CombatContext } from "./abilities";
import type { Fighter } from "./types";

type Point = { x: number; y: number };
type Raid = NonNullable<Fighter["bombardment"]>["raids"][number];

export function bombardmentDirection(from: Point, to: Point) {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
  return length ? { dx: dx / length, dy: dy / length } : null;
}

/** A swept rectangular strip, including its side/end boundaries. Not a ray or a circle. */
export function bombardmentContact(
  raid: Pick<Raid, "from" | "dx" | "dy">, target: Point, start: number = 0, end: number = BOMBARDMENT.length,
) {
  const x = target.x - raid.from.x, y = target.y - raid.from.y;
  const along = x * raid.dx + y * raid.dy;
  return along >= start - 1e-9 && along <= end + 1e-9 &&
    Math.abs(x * raid.dy - y * raid.dx) <= BOMBARDMENT.width / 2 + 1e-9;
}

/** Startup uses the shared interruptible casting state; the released raid is independent. */
export function releaseBombardment(source: Fighter, tick: number) {
  const cast = source.air?.cast, state = source.bombardment;
  if (!state || cast?.kind !== "bombardment") return;
  const direction = bombardmentDirection(cast.from, cast.to);
  delete source.air!.cast;
  if (!direction) return;
  state.launched++;
  state.raids.push({ start: tick, from: { ...cast.from }, ...direction,
    traveled: 0, damage: cast.damage, side: source.side, hit: [] });
}

/** Sample current positions as each strip is bombed. One packet per victim per raid;
 * committed packets survive control, reflection and caster death without extending a finished fight. */
export function advanceBombardments(ctx: CombatContext) {
  for (const source of ctx.fighters) {
    const state = source.bombardment;
    if (!state) continue;
    state.raids = state.raids.filter(raid => {
      const end = Math.min(BOMBARDMENT.length, raid.traveled + BOMBARDMENT.speed);
      for (const target of ctx.fighters.filter(f => f.hp > 0 && f.side !== raid.side &&
        !raid.hit.includes(f.uid) && bombardmentContact(raid, f, raid.traveled, end))
        .sort((a, b) => a.uid - b.uid)) {
        if (target.hp <= 0 || target.side === raid.side) continue;
        raid.hit.push(target.uid);
        const shield = target.shield;
        const hurt = damage(ctx, source, target, raid.damage, "magic", true,
          false, 0, false, false, false, false, 0, true);
        if (hurt > 0 || target.shield < shield) state.hits++;
      }
      const center = (raid.traveled + end) / 2;
      ctx.effects.push({ source: source.uid, target: source.uid, kind: "pulse",
        name: "地毯轰炸", amount: BOMBARDMENT.width,
        from: { ...raid.from },
        to: { x: raid.from.x + raid.dx * center, y: raid.from.y + raid.dy * center } });
      raid.traveled = end;
      return end < BOMBARDMENT.length;
    });
  }
}
