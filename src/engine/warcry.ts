import { WARCRY } from "../data/skills";
import { damage, effect, interruptAirSkill, type CombatContext } from "./abilities";
import { isUndying } from "./immortality";
import { isPhoenixEgg } from "./phoenix";
import { bladeStormActive } from "./swordthrall";
import type { Fighter } from "./types";

type Point = { x: number; y: number };
/** Fixed direction, Euclidean radius and inclusive fan edges; never a full circle. */
export function warcryContains(from: Point, to: Point, target: Point) {
  const dx=to.x-from.x, dy=to.y-from.y, length=Math.hypot(dx,dy);
  if (!length) return false;
  const x=target.x-from.x, y=target.y-from.y, radius=Math.hypot(x,y);
  return radius <= WARCRY.radius+1e-9 &&
    (x*dx+y*dy)/length >= radius*Math.cos(WARCRY.angle*Math.PI/360)-1e-9;
}

export function petrified(f: Fighter, tick: number) {
  return f.hp>0 && (f.petrifyUntil??0)>tick && f.stunUntil>tick &&
    !isUndying(f) && !isPhoenixEgg(f);
}
export function expireWarcry(ctx: CombatContext) {
  for (const f of ctx.fighters) {
    if (f.petrifyUntil!==undefined && !petrified(f,ctx.tick)) delete f.petrifyUntil;
    if (f.warcry && (f.warcry.until<=ctx.tick || f.hp<=0 || isUndying(f) || isPhoenixEgg(f)))
      f.warcry.until=0;
    if (f.warcry?.roar && f.warcry.roar.start+3<=ctx.tick) delete f.warcry.roar;
  }
}

export function releaseWarcry(ctx: CombatContext, source: Fighter) {
  const state=source.warcry, cast=source.air?.cast;
  if (!state || cast?.kind!=="warcry") return;
  delete source.air!.cast; // The released sound is committed, including after lethal reflection.
  state.roars++;
  state.roar={start:ctx.tick,from:{...cast.from},to:{...cast.to}};
  ctx.effects.push({source:source.uid,target:source.uid,kind:"pulse",name:WARCRY.name,
    amount:WARCRY.radius,from:{...cast.from},to:{...cast.to}});
  for (const target of ctx.fighters.filter(f=>f.hp>0 && f.side!==source.side &&
    warcryContains(cast.from,cast.to,f)).sort((a,b)=>a.uid-b.uid)) {
    if (!isUndying(target) && !isPhoenixEgg(target) && !bladeStormActive(target,ctx.tick)) {
      interruptAirSkill(ctx,target);
      const until=ctx.tick+WARCRY.petrify[source.star-1];
      target.stunUntil=Math.max(target.stunUntil,until);
      target.petrifyUntil=Math.max(target.petrifyUntil??0,until);
      state.petrified++;
      effect(ctx,source,target,"stun",WARCRY.petrify[source.star-1]/4,"石化");
    }
    damage(ctx,source,target,cast.damage,"magic",true,false,0,false,false,false,false,0,true);
  }
  if (source.hp>0 && !isUndying(source) && !isPhoenixEgg(source)) {
    state.until=ctx.tick+WARCRY.reflectionDuration;
    state.reflection=WARCRY.reflection[source.star-1];
  }
}

/** Called only for an actual received damage/shield packet, after psychic reflection.
 * A regular lethal hit may retaliate; reflected packets can never recurse. */
export function retaliateWarcry(ctx: CombatContext, defender: Fighter, attacker: Fighter) {
  const state=defender.warcry;
  if (!state || state.until<=ctx.tick || state.reflection<=0 || attacker.hp<=0 ||
    attacker.side===defender.side || isUndying(defender) || isPhoenixEgg(defender)) return;
  state.retaliations++;
  effect(ctx,defender,attacker,"reflect",state.reflection,"战吼反伤");
  const shield=attacker.shield;
  state.retaliationDamage+=damage(ctx,defender,attacker,state.reflection,"true",true,false,0,false,true);
  state.retaliationShield+=Math.max(0,shield-attacker.shield);
}
