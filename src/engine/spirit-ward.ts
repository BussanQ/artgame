import {SPIRIT_WARD} from "../data/skills";
import type {CombatContext} from "./abilities";
import type {Fighter} from "./types";
import {isUndying} from "./immortality";
import {isPhoenixEgg} from "./phoenix";

const distance=(a:Fighter,b:Fighter)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const eligible=(source:Fighter,target:Fighter)=>target.uid!==source.uid&&target.hp>0&&
  target.side===source.side&&!isUndying(target)&&!isPhoenixEgg(target)&&distance(source,target)<=SPIRIT_WARD.range;
const uninterrupted=(source:Fighter,tick:number)=>source.hp>0&&!source.charm&&!isUndying(source)&&!isPhoenixEgg(source)&&
  source.stunUntil<=tick&&(source.silenceUntil??0)<=tick&&source.spiritWard?.channel?.side===source.side;

export function spiritWardTargets(ctx:CombatContext,source:Fighter){
  return ctx.fighters.filter(f=>eligible(source,f)).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||distance(source,a)-distance(source,b)||a.uid-b.uid)
    .slice(0,SPIRIT_WARD.targets[source.star-1]);
}
/** Marks are independent; only the strongest live connection contributes, without stacking. */
export function spiritWardBuff(target:Fighter,tick:number,fighters?:Fighter[]){
  if(target.hp<=0||isUndying(target)||isPhoenixEgg(target))return undefined;
  return target.spiritWards?.filter(mark=>{
    if(mark.until<=tick)return false;
    if(!fighters)return true;
    const source=fighters.find(f=>f.uid===mark.source),cast=source?.spiritWard?.channel;
    return !!source&&!!cast?.formed&&uninterrupted(source,tick)&&eligible(source,target)&&cast.targets.includes(target.uid);
  }).sort((a,b)=>b.armor-a.armor||b.resist-a.resist||b.until-a.until||a.source-b.source)[0];
}
function removeMarks(ctx:CombatContext,source:number){
  for(const target of ctx.fighters)if(target.spiritWards){
    target.spiritWards=target.spiritWards.filter(mark=>mark.source!==source);
    if(!target.spiritWards.length)delete target.spiritWards;
  }
}
function signal(ctx:CombatContext,source:Fighter,name:string,kind:"windup"|"fortify"|"silence",amount=0,target=source){
  ctx.effects.push({source:source.uid,target:target.uid,kind,name,amount,from:{x:source.x,y:source.y},to:{x:target.x,y:target.y}});
}
export function beginSpiritWard(ctx:CombatContext,source:Fighter,targets:Fighter[]){
  const state=source.spiritWard;if(!state||!targets.length)return false;
  const release=ctx.tick+SPIRIT_WARD.windup;
  state.channel={start:ctx.tick,release,until:release+SPIRIT_WARD.duration[source.star-1],side:source.side,
    targets:targets.map(f=>f.uid),formed:false,armor:SPIRIT_WARD.armor[source.star-1],resist:SPIRIT_WARD.resist[source.star-1]};
  source.skillReadyAt=ctx.tick+SPIRIT_WARD.cooldown;
  signal(ctx,source,"庇护蓄灵","windup",SPIRIT_WARD.windup/4);
  return true;
}
export function stopSpiritWard(ctx:CombatContext,source:Fighter,interrupted=false){
  const state=source.spiritWard;if(!state?.channel)return;
  delete state.channel;state.actedAt=ctx.tick;removeMarks(ctx,source.uid);
  if(interrupted){state.interrupted++;signal(ctx,source,"庇护中断","silence");}
}
export function expireSpiritWards(ctx:CombatContext){
  for(const source of ctx.fighters){
    const state=source.spiritWard,cast=state?.channel;if(!state||!cast)continue;
    if(!uninterrupted(source,ctx.tick)){stopSpiritWard(ctx,source,true);continue;}
    if(cast.until<=ctx.tick){stopSpiritWard(ctx,source);continue;}
    const remaining=cast.targets.filter(uid=>{const target=ctx.fighters.find(f=>f.uid===uid);return !!target&&eligible(source,target)});
    if(cast.formed)state.severed+=cast.targets.length-remaining.length;
    cast.targets=remaining;
    if(!remaining.length)stopSpiritWard(ctx,source);
  }
  for(const target of ctx.fighters)if(target.spiritWards){
    target.spiritWards=target.spiritWards.filter(mark=>{
      const source=ctx.fighters.find(f=>f.uid===mark.source),cast=source?.spiritWard?.channel;
      return mark.until>ctx.tick&&!!source&&!!cast?.formed&&uninterrupted(source,ctx.tick)&&eligible(source,target)&&cast.targets.includes(target.uid);
    });
    if(!target.spiritWards.length)delete target.spiritWards;
  }
}
export function advanceSpiritWards(ctx:CombatContext){
  expireSpiritWards(ctx);
  for(const source of ctx.fighters){
    const state=source.spiritWard,cast=state?.channel;
    if(!state||!cast||cast.formed||cast.release>ctx.tick)continue;
    cast.formed=true;state.formed++;state.protected+=cast.targets.length;
    for(const uid of cast.targets){
      const target=ctx.fighters.find(f=>f.uid===uid)!;
      (target.spiritWards??=[]).push({source:source.uid,until:cast.until,armor:cast.armor,resist:cast.resist});
      signal(ctx,source,"庇护成形","fortify",cast.armor,target);
    }
  }
}
export function advanceSpiritWardAction(ctx:CombatContext,source:Fighter){
  const state=source.spiritWard;if(!state)return false;
  const occupied=!!state.channel||state.actedAt===ctx.tick;
  if(state.channel&&!uninterrupted(source,ctx.tick))stopSpiritWard(ctx,source,true);
  return occupied;
}
