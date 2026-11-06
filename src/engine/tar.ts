import { MOTOR_TAR } from "../data/skills";
import { attackTargets } from "./triggers";
import { damage, distance, type CombatContext } from "./abilities";
import type { Fighter } from "./types";

/** Each projectile chooses a different currently visible target; never reserves future enemies. */
export function advanceTarLaunch(ctx: CombatContext, source: Fighter) {
  const pending = source.air?.cast;
  if (!source.tar || pending?.kind !== "tar" || pending.next > ctx.tick) return;
  const target = attackTargets(source, ctx.fighters, ctx.tick)
    .filter(
      (f) =>
        distance(source, f) <= source.range && !pending.marked!.includes(f.uid),
    )
    .sort(
      (a, b) => distance(source, a) - distance(source, b) || a.uid - b.uid,
    )[0];
  if (!target) {
    delete source.air!.cast;
    ctx.effects.push({
      source: source.uid,
      target: source.uid,
      kind: "silence",
      amount: 0,
      name: "目标丢失",
      from: { x: source.x, y: source.y },
      to: { x: source.x, y: source.y },
    });
    return;
  }
  pending.marked!.push(target.uid);
  source.tar.launched++;
  source.tar.bombs.push({
    target: target.uid,
    x: target.x,
    y: target.y,
    until: ctx.tick + MOTOR_TAR.delay,
    damage: pending.damage,
    splash: pending.splash!,
    attached: true,
  });
  ctx.effects.push({
    source: source.uid,
    target: target.uid,
    kind: "tar",
    amount: 3,
    name: MOTOR_TAR.name,
    from: { x: source.x, y: source.y },
    to: { x: target.x, y: target.y },
  });
  if (--pending.remaining === 0) delete source.air!.cast;
  else pending.next += MOTOR_TAR.interval;
}

/** Keep markers on the carrier; once dead, leave the charge at its last location. */
export function updateTarBombPositions(ctx: CombatContext) {
  if (!ctx.fighters.some((f) => f.tar?.bombs.length)) return;
  const carriers = new Map(ctx.fighters.map((f) => [f.uid, f]));
  for (const source of ctx.fighters)
    for (const bomb of source.tar?.bombs ?? []) {
      if (!bomb.attached) continue;
      const carrier = carriers.get(bomb.target);
      if (carrier) {
        bomb.x = carrier.x;
        bomb.y = carrier.y;
      }
      if (!carrier || carrier.hp <= 0) bomb.attached = false;
    }
}

/** Landed charges are independent of the channel. Process dead casters too while battle continues. */
export function advanceTarBombs(ctx: CombatContext) {
  updateTarBombPositions(ctx);
  for (const source of ctx.fighters) {
    if (!source.tar) continue;
    const due = source.tar.bombs.filter((b) => b.until <= ctx.tick);
    source.tar.bombs = source.tar.bombs.filter((b) => b.until > ctx.tick);
    for (const bomb of due) {
      source.tar.detonated++;
      ctx.effects.push({
        source: source.uid,
        target: bomb.target,
        kind: "pulse",
        amount: MOTOR_TAR.radius,
        name: "焦油引爆",
        from: { x: bomb.x, y: bomb.y },
        to: { x: bomb.x, y: bomb.y },
      });
      for (const target of ctx.fighters.filter(
        (f) =>
          f.hp > 0 &&
          f.side !== source.side &&
          distance(bomb, f) <= MOTOR_TAR.radius,
      )) {
        const center = distance(bomb, target) === 0;
        damage(
          ctx,
          source,
          target,
          center ? bomb.damage : bomb.splash,
          "magic",
          true,
          center,
          0,
          false,
          false,
          false,
          false,
          0,
          true,
        );
      }
    }
  }
}
