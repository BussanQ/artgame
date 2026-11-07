import {MENDING} from "../data/skills";
import {combatAttack,heal,gainMana,type CombatContext} from "./abilities";
import {isUndying} from "./immortality";
import {isPhoenixEgg} from "./phoenix";
import type {Fighter} from "./types";

export const emptyMending=():NonNullable<Fighter["mending"]>=>({completed:0,healing:0,energy:0,hastes:0,interrupted:0,missed:0});
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const living=(f:Fighter)=>f.hp>0&&!isUndying(f)&&!isPhoenixEgg(f);
export const mendingHaste=(f:Fighter,tick:number)=>living(f)?Math.max(0,...(f.mendHaste??[]).filter(s=>s.until>tick).map(s=>s.ratio)):0;
export function mendingTarget(ctx:CombatContext,source:Fighter){
 return ctx.fighters.filter(f=>living(f)&&f.side===source.side&&distance(source,f)<=MENDING.range)
  .sort((a,b)=>combatAttack(b,ctx.tick)-combatAttack(a,ctx.tick)||a.uid-b.uid)[0];
}
export function mendingCanCast(ctx:CombatContext,source:Fighter){
 return !!source.mending&&!source.mending.casting&&living(source)&&!source.charm&&!source.executionPuppet&&
  source.stunUntil<=ctx.tick&&(source.silenceUntil??0)<=ctx.tick&&(source.skillReadyAt??0)<=ctx.tick&&!!mendingTarget(ctx,source);
}
export function beginMending(ctx:CombatContext,source:Fighter){
 const target=mendingTarget(ctx,source),state=source.mending;if(!target||!state)return false;
 source.skillReadyAt=ctx.tick+MENDING.cooldown;
 state.casting={start:ctx.tick,release:ctx.tick+MENDING.windup,side:source.side,target:target.uid,power:source.skillPower};
 ctx.effects.push({source:source.uid,target:target.uid,kind:"windup",name:"缝合蓄势",amount:MENDING.windup/4,from:{x:source.x,y:source.y},to:{x:target.x,y:target.y}});
 return true;
}
export function stopMending(ctx:CombatContext,source:Fighter){
 const state=source.mending;if(!state?.casting)return;
 delete state.casting;state.interrupted++;state.actedAt=ctx.tick;
 ctx.effects.push({source:source.uid,target:source.uid,kind:"silence",name:"缝合中断",amount:0,from:{x:source.x,y:source.y},to:{x:source.x,y:source.y}});
}
export function applyMendingHaste(target:Fighter,source:number,ratio:number,until:number){
 const grants=target.mendHaste??=[],old=grants.find(g=>g.source===source);
 if(old){old.ratio=ratio;old.until=until;}else grants.push({source,ratio,until});
 target.mendHaste=grants;
}
export function advanceMendings(ctx:CombatContext){
 for(const f of ctx.fighters)if(f.mendHaste){f.mendHaste=living(f)?f.mendHaste.filter(g=>g.until>ctx.tick):[];if(!f.mendHaste.length)delete f.mendHaste;}
 for(const source of ctx.fighters){
  const state=source.mending,cast=state?.casting;if(!state||!cast)continue;
  if(!living(source)||source.charm||source.side!==cast.side||source.stunUntil>ctx.tick||(source.silenceUntil??0)>ctx.tick){stopMending(ctx,source);continue;}
  if(cast.release>ctx.tick)continue;
  delete state.casting;state.actedAt=ctx.tick;
  const target=ctx.fighters.find(f=>f.uid===cast.target&&living(f)&&f.side===cast.side&&distance(source,f)<=MENDING.range);
  if(!target){state.missed++;ctx.effects.push({source:source.uid,target:source.uid,kind:"silence",name:"缝合落空",amount:0,from:{x:source.x,y:source.y},to:{x:source.x,y:source.y}});continue;}
  state.completed++;const hp=target.hp;
  heal(ctx,source,target,MENDING.healing[source.star-1]*cast.power,"灵蕴修复");state.healing+=target.hp-hp;
  const mana=target.mana;gainMana(target,MENDING.energy[source.star-1],ctx.tick);const actual=target.mana-mana;state.energy+=actual;
  if(actual>0)ctx.effects.push({source:source.uid,target:target.uid,kind:"energize",name:"灵蕴充能",amount:actual,from:{x:source.x,y:source.y},to:{x:target.x,y:target.y}});
  applyMendingHaste(target,source.uid,MENDING.haste[source.star-1],ctx.tick+MENDING.duration);state.hastes++;
  state.pulse={tick:ctx.tick,target:target.uid,from:{x:source.x,y:source.y},to:{x:target.x,y:target.y}};
  ctx.effects.push({source:source.uid,target:target.uid,kind:"haste",name:"灵蕴加速",amount:MENDING.haste[source.star-1]*100,from:{x:source.x,y:source.y},to:{x:target.x,y:target.y}});
 }
}
export const mendingActionBusy=(f:Fighter,tick:number)=>!!f.mending?.casting||f.mending?.actedAt===tick;
