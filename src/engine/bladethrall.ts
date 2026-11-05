import { BLADE_CRITICAL } from "../data/skills";
import {
  combatAttack,
  damage,
  distance,
  type CombatContext,
} from "./abilities";
import { attackTargets } from "./triggers";
import type { Fighter } from "./types";

/** Derive a battle seed from both opening armies, so one UID does not repeat its rolls every round. */
export function seedBladeStrikes(fighters: Fighter[]) {
  if (!fighters.some((f) => f.bladeCrit)) return;
  const opening = JSON.stringify(
    fighters.map((f) => [
      f.uid,
      f.defId,
      f.star,
      f.side,
      f.x,
      f.y,
      f.maxHp,
      f.attack,
      f.armor,
      f.interval,
    ]),
  );
  let seed = 2166136261;
  for (let i = 0; i < opening.length; i++)
    seed = Math.imul(seed ^ opening.charCodeAt(i), 16777619) >>> 0;
  for (const f of fighters) if (f.bladeCrit) f.bladeCrit.seed = seed;
}

/** Per-unit attack stream: replayable without touching campaign/shop RNG. */
export function bladeStrike(
  ctx: CombatContext,
  source: Fighter,
  target: Fighter,
): boolean {
  const state = source.bladeCrit;
  if (
    !state ||
    source.defId !== "bladethrall" ||
    source.summon ||
    source.hp <= 0 ||
    source.stunUntil > ctx.tick ||
    distance(source, target) > source.range ||
    !attackTargets(source, ctx.fighters, ctx.tick).some(
      (f) => f.uid === target.uid,
    )
  )
    return false;
  let n =
    (Math.imul(source.uid, 374761393) ^
      Math.imul(++state.attempts, 668265263) ^
      (state.seed ?? 0) ^
      0x6d2b79f5) >>>
    0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  const critical = n / 4294967296 < BLADE_CRITICAL.chance;
  if (critical) state.crits++;
  damage(
    ctx,
    source,
    target,
    combatAttack(source, ctx.tick) *
      (critical ? BLADE_CRITICAL.multiplier[source.star - 1] : 1),
    "physical",
    false,
    true,
    0,
    false,
    false,
    false,
    critical,
  );
  return true;
}
