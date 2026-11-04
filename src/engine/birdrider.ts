import {
  combatAttack,
  damage,
  distance,
  type CombatContext,
} from "./abilities";
import { attackTargets } from "./triggers";
import type { Fighter } from "./types";

/** May 30, 2019: 6/5/4 ordinary attacks, then a charged 300% physical attack. */
export const faithAttackCount = (star: number) => 7 - star;

/** Called only for an ordinary attack opportunity; returns true when drawing replaces it. */
export function startFaithArrow(
  ctx: CombatContext,
  source: Fighter,
  target: Fighter,
) {
  const bird = source.bird;
  if (
    !bird ||
    bird.draw ||
    source.hp <= 0 ||
    source.charm ||
    source.stunUntil > ctx.tick ||
    distance(source, target) > source.range ||
    !attackTargets(source, ctx.fighters, ctx.tick).some(
      (f) => f.uid === target.uid,
    )
  )
    return false;
  if (bird.shots < faithAttackCount(source.star)) {
    bird.shots++;
    return false;
  }
  bird.shots = 0;
  bird.draw = {
    target: target.uid,
    until: ctx.tick + 2,
    damage: combatAttack(source, ctx.tick) * 3,
  };
  if (source.signature) source.signature.casts++;
  return true;
}

/** Passive attack: silence and energy locks do not interrupt it; hard control does. */
export function advanceFaithArrow(ctx: CombatContext, source: Fighter) {
  const draw = source.bird?.draw;
  if (!draw) return false;
  const target = attackTargets(source, ctx.fighters, ctx.tick).find(
    (f) => f.uid === draw.target && distance(source, f) <= source.range,
  );
  if (
    source.hp <= 0 ||
    source.charm ||
    source.stunUntil > ctx.tick ||
    !target
  ) {
    delete source.bird!.draw;
    ctx.effects.push({
      source: source.uid,
      target: source.uid,
      kind: "silence",
      amount: 0,
      name: "蓄力中断",
      from: { x: source.x, y: source.y },
      to: { x: source.x, y: source.y },
    });
    return true;
  }
  if (ctx.tick < draw.until) return true;
  delete source.bird!.draw;
  damage(
    ctx,
    source,
    target,
    draw.damage,
    "physical",
    false,
    true,
    0,
    false,
    false,
    false,
    true,
  );
  return true;
}
