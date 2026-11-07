import { JUNGLE } from "../data/skills";
import { damage, interruptAirSkill, type CombatContext } from "./abilities";
import { isUndying } from "./immortality";
import { isPhoenixEgg } from "./phoenix";
import { bladeStormActive } from "./swordthrall";
import type { Fighter } from "./types";

export function jungleContains(center: { x: number; y: number }, target: { x: number; y: number }) {
  return Math.hypot(target.x - center.x, target.y - center.y) <= JUNGLE.radius + 1e-9;
}
function controllable(ctx: CombatContext, target: Fighter) {
  return target.hp > 0 && !isUndying(target) && !isPhoenixEgg(target) && !bladeStormActive(target, ctx.tick);
}

/** The released wave is committed; reflection killing its caster does not cancel remaining targets. */
export function releaseJungle(ctx: CombatContext, source: Fighter) {
  const cast = source.air?.cast;
  if (!source.jungle || cast?.kind !== "jungle") return;
  delete source.air!.cast;
  source.jungle.waves++;
  const side = source.side;
  const targets = ctx.fighters.filter((f) => f.hp > 0 && f.side !== side && jungleContains(cast.from, f))
    .sort((a, b) => a.uid - b.uid);
  ctx.effects.push({ source: source.uid, target: source.uid, kind: "pulse", amount: JUNGLE.radius,
    name: JUNGLE.name, from: cast.from, to: cast.from });
  for (const target of targets) {
    source.jungle.hits++;
    damage(ctx, source, target, cast.damage, "magic", true, target.uid === cast.target,
      0, false, false, false, false, 0, true);
    if (!controllable(ctx, target)) continue;
    interruptAirSkill(ctx, target);
    const landing = ctx.tick + JUNGLE.flight;
    target.knockup = { start: ctx.tick, until: Math.max(target.knockup?.until ?? 0, landing) };
    target.stunUntil = Math.max(target.stunUntil, landing);
    (target.jungleLandings ??= []).push({ source: source.uid, at: landing,
      duration: JUNGLE.stun[source.star - 1] });
    source.jungle.knockups++;
    ctx.effects.push({ source: source.uid, target: target.uid, kind: "stun", amount: JUNGLE.flight / 4,
      name: "击飞", from: cast.from, to: { x: target.x, y: target.y } });
  }
}

/** Resolve the second control stage at actual landing; overlapping lifts defer it, cleansing cancels it. */
export function advanceJungleLandings(ctx: CombatContext) {
  for (const target of ctx.fighters) {
    if (!target.jungleLandings) continue;
    if (target.hp <= 0 || isUndying(target) || isPhoenixEgg(target)) {
      delete target.jungleLandings;
      continue;
    }
    target.jungleLandings = target.jungleLandings.filter((landing) => {
      if (landing.at > ctx.tick || (target.knockup?.until ?? 0) > ctx.tick) return true;
      if (!controllable(ctx, target)) return false;
      const source = ctx.fighters.find((f) => f.uid === landing.source);
      if (!source) return false;
      interruptAirSkill(ctx, target);
      target.stunUntil = Math.max(target.stunUntil, ctx.tick + landing.duration);
      if (landing.kind === "tornado") {
        if (source.tornado) source.tornado.landings++;
      } else if (source.jungle) source.jungle.landings++;
      ctx.effects.push({ source: source.uid, target: target.uid, kind: "stun", amount: landing.duration / 4,
        name: "落地眩晕", from: { x: source.x, y: source.y }, to: { x: target.x, y: target.y } });
      return false;
    });
    if (!target.jungleLandings.length) delete target.jungleLandings;
  }
}
