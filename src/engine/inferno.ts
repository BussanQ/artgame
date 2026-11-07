import {INFERNO} from "../data/skills";
import {damage,type CombatContext} from "./abilities";
import {attackTargets} from "./triggers";
import {isUndying} from "./immortality";
import {isPhoenixEgg} from "./phoenix";
import {bladeStormActive} from "./swordthrall";
import type {Fighter} from "./types";

export const emptyInferno=():NonNullable<Fighter["inferno"]>=>({formed:0,hits:0,slows:0,healing:0,interrupted:0});
export const infernoActive=(f:Fighter,tick:number)=>f.hp>0&&!isUndying(f)&&!isPhoenixEgg(f)&&!!f.inferno?.active&&f.inferno.active.until>tick;
export const attackSlowRate=(f:Pick<Fighter,"attackSlows">,tick:number)=>Math.max(0,...(f.attackSlows??[]).filter(s=>s.until>tick).map(s=>s.rate));
const inCircle=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y)<=INFERNO.radius+1e-9;
export function infernoCanCast(ctx:CombatContext,source:Fighter){
 return !!source.inferno&&!source.inferno.casting&&!source.executionPuppet&&source.hp>0&&!source.charm&&
  !isUndying(source)&&!isPhoenixEgg(source)&&source.stunUntil<=ctx.tick&&(source.silenceUntil??0)<=ctx.tick&&
  (source.skillReadyAt??0)<=ctx.tick&&attackTargets(source,ctx.fighters,ctx.tick).some(f=>inCircle(source,f));
}
export function beginInferno(ctx:CombatContext,source:Fighter){
 const state=source.inferno;if(!state)return false;
 source.skillReadyAt=ctx.tick+INFERNO.cooldown;
 state.casting={start:ctx.tick,release:ctx.tick+INFERNO.windup,side:source.side,power:source.skillPower};
 ctx.effects.push({source:source.uid,target:source.uid,kind:"windup",name:"炎狱蓄势",amount:INFERNO.windup/4,from:{x:source.x,y:source.y},to:{x:source.x,y:source.y}});
 return true;
}
export function stopInferno(ctx:CombatContext,source:Fighter){
 const state=source.inferno;if(!state?.casting)return;
 delete state.casting;state.interrupted++;state.actedAt=ctx.tick;
 ctx.effects.push({source:source.uid,target:source.uid,kind:"silence",name:"炎狱中断",amount:0,from:{x:source.x,y:source.y},to:{x:source.x,y:source.y}});
}
/** Independent status lifetimes prevent a weak recast from prolonging a stronger reduction. */
export function applyAttackSlow(target:Fighter,source:number,rate:number,until:number){
 const grants=target.attackSlows??=[];
 const old=grants.find(s=>s.source===source);
 if(old){old.rate=rate;old.until=until;}else grants.push({source,rate,until});
 target.attackSlows=grants;
}
export function advanceInfernos(ctx:CombatContext){
 for(const target of ctx.fighters){
  if(target.attackSlows){
   target.attackSlows=target.hp<=0||isUndying(target)||isPhoenixEgg(target)||bladeStormActive(target,ctx.tick)?[]:target.attackSlows.filter(s=>s.until>ctx.tick);
   if(!target.attackSlows.length)delete target.attackSlows;
  }
  if(target.inferno?.active&&!infernoActive(target,ctx.tick))delete target.inferno.active;
 }
 for(const source of ctx.fighters){
  const state=source.inferno,cast=state?.casting;if(!state||!cast)continue;
  if(source.hp<=0||isUndying(source)||isPhoenixEgg(source)||source.charm||source.stunUntil>ctx.tick||(source.silenceUntil??0)>ctx.tick||source.side!==cast.side){stopInferno(ctx,source);continue;}
  if(cast.release>ctx.tick)continue;
  delete state.casting;state.actedAt=ctx.tick;state.formed++;
  state.active={start:ctx.tick,until:ctx.tick+INFERNO.duration};state.pulse={tick:ctx.tick,x:source.x,y:source.y};
  const from={x:source.x,y:source.y},side=source.side;
  ctx.effects.push({source:source.uid,target:source.uid,kind:"pulse",name:INFERNO.name,amount:INFERNO.radius,from,to:{...from}});
  // The released shockwave is committed; reflection cannot cancel its remaining contacts.
  for(const target of ctx.fighters.filter(f=>f.hp>0&&f.side!==side&&inCircle(source,f)).sort((a,b)=>a.uid-b.uid)){
   const at=ctx.events.length;
   damage(ctx,source,target,INFERNO.damage[source.star-1]*cast.power,"magic",true,false,0,false,false,false,false,0,true,false,{side,from});
   if(ctx.events.slice(at).some(e=>e.attacker===source.uid&&e.target===target.uid&&!e.immune&&(e.amount>0||e.absorbed>0)))state.hits++;
   if(target.hp<=0||isUndying(target)||isPhoenixEgg(target)||bladeStormActive(target,ctx.tick))continue;
   applyAttackSlow(target,source.uid,INFERNO.slow[source.star-1],ctx.tick+INFERNO.duration);state.slows++;
   ctx.effects.push({source:source.uid,target:target.uid,kind:"slow",name:"炎狱减速",amount:INFERNO.slow[source.star-1]*100,from,to:{x:target.x,y:target.y}});
  }
 }
}
export const infernoActionBusy=(f:Fighter,tick:number)=>!!f.inferno?.casting||f.inferno?.actedAt===tick;
