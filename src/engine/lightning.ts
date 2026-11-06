import { THUNDER_CHAIN } from "../data/skills";
import {
  combatAttack,
  damage,
  distance,
  type CombatContext,
} from "./abilities";
import { attackTargets } from "./triggers";
import type { Fighter } from "./types";

/** One attack action, bounded hops. Re-select after each hit's deaths and retaliation. */
export function lightningStrike(
  ctx: CombatContext,
  source: Fighter,
  first: Fighter,
) {
  if (!source.lightningChain) return false;
  if (
    source.hp <= 0 ||
    source.stunUntil > ctx.tick ||
    distance(source, first) > source.range ||
    !attackTargets(source, ctx.fighters, ctx.tick).includes(first)
  )
    return true;
  const side = source.side;
  const base = combatAttack(source, ctx.tick);
  let target: Fighter | undefined = first;
  let origin = { x: source.x, y: source.y };
  for (
    let hop = 0;
    hop < THUNDER_CHAIN.hits[source.star - 1] && target;
    hop++
  ) {
    if (source.hp <= 0 || source.stunUntil > ctx.tick || source.side !== side)
      break;
    const before = ctx.events.length;
    const to = { x: target.x, y: target.y };
    damage(
      ctx,
      source,
      target,
      base * THUNDER_CHAIN.retention ** hop,
      "physical",
      false,
      hop === 0,
    );
    const hit = ctx.events
      .slice(before)
      .find(
        (e) =>
          e.attacker === source.uid &&
          e.target === target!.uid &&
          !e.reflected &&
          !e.skill,
      );
    if (!hit) break;
    hit.chainHop = hop;
    hit.from = origin;
    ctx.effects.push({
      source: source.uid,
      target: target.uid,
      kind: "chain",
      name: THUNDER_CHAIN.name,
      chainHop: hop,
      amount: hit.amount,
      from: origin,
      to,
    });
    if (hop === 0 && hit.evaded) break;
    const previous: Fighter = target;
    origin = to;
    target = attackTargets(source, ctx.fighters, ctx.tick)
      .filter(
        (e) =>
          e.uid !== previous.uid &&
          distance(previous, e) <= THUNDER_CHAIN.radius,
      )
      .sort(
        (a, b) =>
          distance(previous, a) - distance(previous, b) || a.uid - b.uid,
      )[0];
  }
  return true;
}
