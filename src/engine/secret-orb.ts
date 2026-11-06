import { SECRET_ORB } from "../data/skills";
import { damage, type CombatContext } from "./abilities";
import { usesEnergy } from "./triggers";
import { isUndying } from "./immortality";
import { isPhoenixEgg } from "./phoenix";
import type { Fighter } from "./types";

type Point = {x:number;y:number};
/** Ground lock: at the target, or at most three tiles toward a distant target. */
export function secretOrbCenter(source:Point,target:Point):Point {
  const dx=target.x-source.x,dy=target.y-source.y,distance=Math.hypot(dx,dy);
  const ratio=distance ? Math.min(SECRET_ORB.forward,distance)/distance : 0;
  return {x:source.x+dx*ratio,y:source.y+dy*ratio};
}
export const secretOrbContains = (orb:Point&{radius:number},target:Point) =>
  Math.hypot(target.x-orb.x,target.y-orb.y)<=orb.radius+1e-9;
/** Seven evenly scheduled hits, rounded forward to simulation ticks. */
export const secretOrbPulseTick = (start:number,duration:number,index:number) =>
  start+Math.ceil(duration*(index+1)/SECRET_ORB.pulses);
/** Rounded raw slices add up to the frozen total; each hit still mitigates independently. */
export const secretOrbPulseDamage = (total:number,index:number) =>
  Math.round(total*(index+1)/SECRET_ORB.pulses)-Math.round(total*index/SECRET_ORB.pulses);

export function beginSecretOrb(ctx:CombatContext,source:Fighter,target:Fighter) {
  const state=source.secretOrb;if(!state)return false;
  state.casting={start:ctx.tick,until:ctx.tick+SECRET_ORB.windup,
    from:{x:source.x,y:source.y},to:secretOrbCenter(source,target),
    damage:SECRET_ORB.damage[source.star-1]*source.skillPower,
    radius:SECRET_ORB.radius[source.star-1],side:source.side};
  source.skillReadyAt=ctx.tick+SECRET_ORB.cooldown;
  return true;
}
function interrupted(source:Fighter,tick:number) {
  return source.hp<=0 || !!source.charm || source.stunUntil>tick ||
    (source.silenceUntil??0)>tick || isUndying(source) || isPhoenixEgg(source);
}
export function expireSecretOrbs(ctx:CombatContext) {
  for(const source of ctx.fighters) {
    const state=source.secretOrb;if(!state)continue;
    // A successfully completed channel is not an interruption.
    if(state.channel && state.channel.until<ctx.tick)delete state.channel;
    if(!(state.casting||state.channel)||!interrupted(source,ctx.tick))continue;
    delete state.casting;delete state.channel;state.interrupted++;
    ctx.effects.push({source:source.uid,target:source.uid,kind:"silence",name:"秘法球中断",amount:0.25,
      from:{x:source.x,y:source.y},to:{x:source.x,y:source.y}});
  }
}
/** Consumes the actor's action while forming or maintaining the orb. */
export function advanceSecretOrbAction(ctx:CombatContext,source:Fighter) {
  const state=source.secretOrb;if(!state)return false;
  const occupied=!!(state.casting||state.channel);
  expireSecretOrbs(ctx);
  if(state.channel)return true;
  const cast=state.casting;if(!cast)return occupied;
  if(cast.until>ctx.tick)return true;
  delete state.casting;state.formed++;
  state.channel={...cast.to,start:ctx.tick,until:ctx.tick+SECRET_ORB.duration[source.star-1],
    nextIndex:0,damage:cast.damage,radius:cast.radius,side:cast.side};
  return true;
}
export function advanceSecretOrbPulses(ctx:CombatContext) {
  expireSecretOrbs(ctx);
  for(const source of ctx.fighters) {
    const state=source.secretOrb,orb=state?.channel;
    if(!state||!orb||orb.nextIndex>=SECRET_ORB.pulses ||
      secretOrbPulseTick(orb.start,orb.until-orb.start,orb.nextIndex)>ctx.tick)continue;
    const amount=secretOrbPulseDamage(orb.damage,orb.nextIndex++);
    state.pulses++;
    for(const target of ctx.fighters.filter(f=>f.hp>0&&f.side!==orb.side&&secretOrbContains(orb,f))
      .sort((a,b)=>a.uid-b.uid)) {
      if(interrupted(source,ctx.tick))break;
      if(target.hp<=0||target.side===orb.side)continue;
      const shield=target.shield;
      const hurt=damage(ctx,source,target,amount,"magic",true,false,0,false,false,true);
      if(!(hurt>0||target.shield<shield))continue;
      state.hits++;
      if(target.hp<=0||isUndying(target)||isPhoenixEgg(target)||!usesEnergy(target))continue;
      const removed=Math.min(SECRET_ORB.drain,target.mana);if(removed<=0)continue;
      target.mana-=removed;state.energyRemoved+=removed;
      ctx.effects.push({source:source.uid,target:target.uid,kind:"drain",name:"秘法球削能",amount:removed,
        from:{x:orb.x,y:orb.y},to:{x:target.x,y:target.y}});
    }
    if(orb.nextIndex>=SECRET_ORB.pulses)delete state.channel;
  }
  expireSecretOrbs(ctx);
}
