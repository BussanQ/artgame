import { WUSHI, WUSHI_CONTROL } from "../data/skills";
import { combatAttack, damage, distance, type CombatContext } from "./abilities";
import type { Fighter } from "./types";
export {tauntTarget as wushiTauntTarget,expireTaunts as expireWushiTaunts} from "./taunt";
import { isUndying } from "./immortality";
import { isPhoenixEgg } from "./phoenix";
import { bladeStormActive } from "./swordthrall";

export const wushiActive = (fighter: Pick<Fighter, "hp" | "wushi">, tick: number) =>
  fighter.hp > 0 && !!fighter.wushi && fighter.wushi.until > tick;

function signal(ctx: CombatContext, source: Fighter, kind: "transform" | "windup" | "silence", name: string, amount: number) {
  ctx.effects.push({ source: source.uid, target: source.uid, kind, name, amount,
    from: { x: source.x, y: source.y }, to: { x: source.x, y: source.y } });
}

export function beginWushi(ctx: CombatContext, source: Fighter) {
  const state = source.wushi;
  if (!state) return false;
  state.casting = { start: ctx.tick, until: ctx.tick + WUSHI.windup };
  source.skillReadyAt = ctx.tick + WUSHI.cooldown;
  signal(ctx, source, "windup", "无式蓄力", WUSHI.windup / 4);
  return true;
}

function interrupt(ctx: CombatContext, source: Fighter) {
  const state = source.wushi!;
  delete state.casting;
  state.interrupted++;
  signal(ctx, source, "silence", "蓄力中断", 0.25);
}

function tauntNearby(ctx: CombatContext, source: Fighter) {
  if (source.wushi?.taunts === undefined) return;
  for (const victim of ctx.fighters.filter(f => f.hp > 0 && f.side !== source.side &&
      distance(source, f) <= WUSHI_CONTROL.tauntRadius && !isUndying(f) &&
      !isPhoenixEgg(f) && !bladeStormActive(f, ctx.tick))) {
    victim.taunt = { source: source.uid, until: ctx.tick + WUSHI_CONTROL.tauntDuration };
    source.wushi.taunts++;
    ctx.effects.push({ source: source.uid, target: victim.uid, kind: "taunt", name: "无式嘲讽",
      amount: WUSHI_CONTROL.tauntDuration / 4,
      from: { x: source.x, y: source.y }, to: { x: victim.x, y: victim.y } });
  }
}

/** Expiry is separate from action readiness: stun never extends a completed form. */
export function expireWushi(ctx: CombatContext) {
  for (const source of ctx.fighters) {
    const state = source.wushi;
    if (!state) continue;
    if (source.hp <= 0 && state.casting) interrupt(ctx, source);
    if (state.until > 0 && (source.hp <= 0 || state.until <= ctx.tick)) {
      state.until = 0;
      state.armor = 0;
      if (source.hp > 0) signal(ctx, source, "transform", "无式结束", 0);
    }
  }
}

/** A completed transformation survives silence/stun; its startup does not. */
export function advanceWushi(ctx: CombatContext, source: Fighter) {
  const state = source.wushi, cast = state?.casting;
  if (!state || !cast) return false;
  if (source.hp <= 0 || source.charm || source.stunUntil > ctx.tick ||
      (source.silenceUntil ?? 0) > ctx.tick) {
    interrupt(ctx, source);
    return true;
  }
  if (cast.until <= ctx.tick) {
    delete state.casting;
    state.until = ctx.tick + WUSHI.duration[source.star - 1];
    state.armor = WUSHI.armor[source.star - 1];
    state.forms++;
    signal(ctx, source, "transform", WUSHI.name, WUSHI.duration[source.star - 1] / 4);
    tauntNearby(ctx, source);
  }
  return true;
}

/** Local tile conversion: primary plus Manhattan-one neighbours. Each contact
 * is a real ordinary attack, including shields/evasion/lifesteal/reflection. */
export function wushiStrike(ctx: CombatContext, source: Fighter, primary: Fighter) {
  if (!wushiActive(source, ctx.tick)) return false;
  if (source.stunUntil > ctx.tick) return true;
  const targets = [primary, ...ctx.fighters.filter(target => target.uid !== primary.uid &&
    target.hp > 0 && target.side !== source.side && distance(target, primary) <= WUSHI.splashRadius)
    .sort((a, b) => a.uid - b.uid)];
  if (source.wushi!.taunts !== undefined) targets.length = Math.min(targets.length, WUSHI_CONTROL.maxTargets);
  const attack = combatAttack(source, ctx.tick);
  source.wushi!.sweeps++;
  for (const target of targets) {
    if (source.hp <= 0 || target.hp <= 0 || target.side === source.side) continue;
    const offset = ctx.events.length;
    damage(ctx, source, target, attack, "physical", false, target.uid === primary.uid);
    const event = ctx.events.slice(offset).find(event => event.attacker === source.uid && event.target === target.uid);
    if (target.uid !== primary.uid && event) {
      event.wushiSplash = true;
      if (event.amount + event.absorbed > 0) source.wushi!.splashHits++;
    }
  }
  ctx.effects.push({ source: source.uid, target: primary.uid, kind: "pulse", name: "无式横斩",
    amount: WUSHI.splashRadius, from: { x: source.x, y: source.y }, to: { x: primary.x, y: primary.y } });
  return true;
}
