import {TORTOISE} from "../data/skills";
import {RULES} from "../data/units";
import {combatAttack,damage,type CombatContext} from "./abilities";
import {attackTargets} from "./triggers";
import {tauntTarget} from "./taunt";
import {isUndying} from "./immortality";
import {isPhoenixEgg} from "./phoenix";
import {bladeStormActive} from "./swordthrall";
import type {Fighter} from "./types";

const livingBody=(f:Fighter)=>f.hp>0&&!isUndying(f)&&!isPhoenixEgg(f);
export const tortoiseShellActive=(f:Fighter)=>livingBody(f)&&f.tortoise?.mode==="shell";
export function tortoiseArmor(f:Fighter){
  if(!livingBody(f))return 0;
  return f.tortoise?.mode==="shell"?TORTOISE.armor[f.star-1]:f.tortoise?.mode==="breach"?-TORTOISE.breachArmorLoss:0;
}
export function tortoiseResist(f:Fighter){
  return tortoiseShellActive(f)?TORTOISE.resist[f.star-1]:0;
}
function signal(ctx:CombatContext,source:Fighter,name:string,kind:"windup"|"transform"|"silence",amount=0){
  ctx.effects.push({source:source.uid,target:source.uid,kind,name,amount,from:{x:source.x,y:source.y},to:{x:source.x,y:source.y}});
}
export function beginTortoise(ctx:CombatContext,source:Fighter){
  const state=source.tortoise;if(!state||state.mode||state.casting)return false;
  source.skillReadyAt=ctx.tick+TORTOISE.cooldown;
  state.casting={start:ctx.tick,release:ctx.tick+TORTOISE.windup,side:source.side};
  signal(ctx,source,"玄武蓄势","windup",TORTOISE.windup/4);
  return true;
}
export function stopTortoise(ctx:CombatContext,source:Fighter){
  const state=source.tortoise;if(!state?.casting)return;
  delete state.casting;state.interrupted++;state.actedAt=ctx.tick;
  signal(ctx,source,"变形中断","silence");
}
const uninterrupted=(source:Fighter,tick:number)=>livingBody(source)&&!source.charm&&source.stunUntil<=tick&&
  (source.silenceUntil??0)<=tick&&source.side===source.tortoise?.casting?.side;

/** Permanent ordinary-attack redirection. Skills and already committed attacks keep their own selection. */
export function refreshTortoiseTaunts(ctx:CombatContext){
  const shells=ctx.fighters.filter(tortoiseShellActive);
  for(const victim of ctx.fighters){
    if(!livingBody(victim)||bladeStormActive(victim,ctx.tick)){
      if(victim.taunt?.kind==="tortoise")delete victim.taunt;
      continue;
    }
    if(victim.taunt&&victim.taunt.kind!=="tortoise"&&tauntTarget(ctx,victim))continue;
    const visible=new Set(attackTargets(victim,ctx.fighters,ctx.tick).map(f=>f.uid));
    const source=shells.filter(f=>f.side!==victim.side&&visible.has(f.uid)).sort((a,b)=>
      b.star-a.star||Math.abs(a.x-victim.x)+Math.abs(a.y-victim.y)-Math.abs(b.x-victim.x)-Math.abs(b.y-victim.y)||a.uid-b.uid)[0];
    if(!source){if(victim.taunt?.kind==="tortoise")delete victim.taunt;continue;}
    if(victim.taunt?.kind!=="tortoise"||victim.taunt.source!==source.uid){
      source.tortoise!.taunts++;
      ctx.effects.push({source:source.uid,target:victim.uid,kind:"taunt",name:"龟缩引火",amount:0,
        from:{x:source.x,y:source.y},to:{x:victim.x,y:victim.y}});
    }
    victim.taunt={kind:"tortoise",source:source.uid,until:RULES.maxTicks+1};
  }
}
export function advanceTortoises(ctx:CombatContext){
  for(const source of ctx.fighters){
    const state=source.tortoise,cast=state?.casting;if(!state||!cast)continue;
    if(!uninterrupted(source,ctx.tick)){stopTortoise(ctx,source);continue;}
    if(cast.release>ctx.tick)continue;
    state.allies=ctx.fighters.filter(f=>livingBody(f)&&f.side===source.side).length;
    state.enemies=ctx.fighters.filter(f=>livingBody(f)&&f.side!==source.side).length;
    state.mode=state.allies>state.enemies?"breach":"shell";
    state.formed++;state.actedAt=ctx.tick;source.mana=0;delete state.casting;
    signal(ctx,source,state.mode==="shell"?"龟缩守御":"破壳出击","transform",state.mode==="shell"?0:1);
  }
  refreshTortoiseTaunts(ctx);
}
export function advanceTortoiseAction(ctx:CombatContext,source:Fighter){
  const state=source.tortoise;if(!state)return false;
  const occupied=!!state.casting||state.actedAt===ctx.tick||state.mode==="shell";
  if(state.casting&&!uninterrupted(source,ctx.tick))stopTortoise(ctx,source);
  return occupied;
}
/** A single ordinary action; every contact uses the normal physical damage, dodge and reflection path. */
export function tortoiseStrike(ctx:CombatContext,source:Fighter,target:Fighter){
  const state=source.tortoise;
  if(!state||state.mode!=="breach")return false;
  state.swings++;
  const center={x:target.x,y:target.y},raw=combatAttack(source,ctx.tick)*TORTOISE.multiplier[source.star-1];
  state.strike={tick:ctx.tick,...center};
  const contacts=attackTargets(source,ctx.fighters,ctx.tick).filter(f=>f.uid===target.uid||
    Math.abs(f.x-center.x)+Math.abs(f.y-center.y)<=TORTOISE.radius).sort((a,b)=>
      Number(b.uid===target.uid)-Number(a.uid===target.uid)||a.uid-b.uid);
  for(const victim of contacts){
    if(!livingBody(source))break;
    const start=ctx.events.length;
    damage(ctx,source,victim,raw,"physical",false,victim.uid===target.uid);
    if(victim.uid!==target.uid&&ctx.events.slice(start).some(e=>e.attacker===source.uid&&e.target===victim.uid&&!e.evaded&&!e.immune&&(e.amount>0||e.absorbed>0)))state.splashHits++;
  }
  return true;
}
