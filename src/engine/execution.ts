import {EXECUTION} from "../data/skills";
import {emptyInferno} from "./inferno";
import {emptyMending} from "./mending";
import {emptyFormless} from "./formless";
import {damage,type CombatContext} from "./abilities";
import {attackTargets} from "./triggers";
import {isPhoenixEgg} from "./phoenix";
import {isUndying} from "./immortality";
import type {Fighter} from "./types";

const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export const executionMarks=(source:Fighter,target:Fighter)=>target.reaperMarks?.find(m=>m.source===source.uid)?.stacks??0;
/** Called only after normal attack evasion/immunity checks; no extra damage packet is invented. */
export function stampExecution(ctx:CombatContext,source:Fighter,target:Fighter){
  if(!source.reaper||source.executionPuppet)return false;
  const marks=target.reaperMarks??=[],mark=marks.find(m=>m.source===source.uid);
  if(!mark){marks.push({source:source.uid,stacks:1});source.reaper.marks++;}
  else if(mark.stacks<EXECUTION.marks){mark.stacks++;source.reaper.marks++;}
  target.reaperMarks=marks;
  return executionMarks(source,target)>=EXECUTION.marks;
}
export function executionLanding(ctx:CombatContext,source:Fighter,target:Fighter){
  const occupied=new Set(ctx.fighters.filter(f=>f.hp>0).map(f=>`${f.x},${f.y}`));
  const dx=target.x-source.x,dy=target.y-source.y;
  return [[0,1],[-1,0],[1,0],[0,-1]].map(([x,y])=>({x:target.x+x,y:target.y+y})).filter(p=>
    p.x>=0&&p.x<8&&p.y>=0&&p.y<8&&!occupied.has(`${p.x},${p.y}`)).sort((a,b)=>
      ((b.x-target.x)*dx+(b.y-target.y)*dy)-((a.x-target.x)*dx+(a.y-target.y)*dy)||distance(source,a)-distance(source,b)||a.y-b.y||a.x-b.x)[0];
}
export function executionCanCast(ctx:CombatContext,source:Fighter,target:Fighter){
  return !!source.reaper&&!source.executionPuppet&&!source.reaper.casting&&source.hp>0&&!source.charm&&
    source.stunUntil<=ctx.tick&&(source.silenceUntil??0)<=ctx.tick&&(source.skillReadyAt??0)<=ctx.tick&&
    distance(source,target)<=source.range&&attackTargets(source,ctx.fighters,ctx.tick).some(f=>f.uid===target.uid)&&!!executionLanding(ctx,source,target);
}
export function beginExecution(ctx:CombatContext,source:Fighter,target:Fighter){
  const at=executionLanding(ctx,source,target),state=source.reaper;if(!at||!state)return false;
  ctx.effects.push({source:source.uid,target:target.uid,kind:"teleport",name:"刑杀闪现",amount:0,from:{x:source.x,y:source.y},to:at});
  source.x=at.x;source.y=at.y;source.skillReadyAt=ctx.tick+EXECUTION.cooldown;
  state.casting={start:ctx.tick,release:ctx.tick+EXECUTION.windup,target:target.uid,side:source.side,power:source.skillPower};
  ctx.effects.push({source:source.uid,target:source.uid,kind:"windup",name:"刑杀潜行",amount:EXECUTION.windup/4,from:at,to:at});
  return true;
}
export function stopExecution(ctx:CombatContext,source:Fighter){
  const state=source.reaper;if(!state?.casting)return;
  delete state.casting;state.interrupted++;state.actedAt=ctx.tick;
  ctx.effects.push({source:source.uid,target:source.uid,kind:"silence",name:"刑杀中断",amount:0,from:{x:source.x,y:source.y},to:{x:source.x,y:source.y}});
}
export function advanceExecutions(ctx:CombatContext){
  for(const source of ctx.fighters){
    const state=source.reaper,cast=state?.casting;if(!state||!cast)continue;
    if(source.hp<=0||source.charm||source.stunUntil>ctx.tick||(source.silenceUntil??0)>ctx.tick||source.side!==cast.side){stopExecution(ctx,source);continue;}
    if(cast.release>ctx.tick)continue;
    const target=attackTargets(source,ctx.fighters,ctx.tick).find(f=>f.uid===cast.target&&distance(source,f)<=source.range);
    delete state.casting;state.actedAt=ctx.tick;
    if(!target){state.missed++;continue;}
    const full=executionMarks(source,target)>=EXECUTION.marks;
    target.reaperMarks=target.reaperMarks?.filter(mark=>mark.source!==source.uid);
    if(!target.reaperMarks?.length)delete target.reaperMarks;
    state.executions++;if(full)state.enhanced++;
    ctx.effects.push({source:source.uid,target:target.uid,kind:"pulse",name:full?"满印刑杀":"刑杀",amount:full?2:1,from:{x:source.x,y:source.y},to:{x:target.x,y:target.y}});
    damage(ctx,source,target,EXECUTION.damage[source.star-1]*(full?2:1)*cast.power,"magic",true,true,0,false,false,false,false,0,false,true);
  }
}
export const executionActionBusy=(f:Fighter,tick:number)=>!!f.reaper?.casting||f.reaper?.actedAt===tick;

/** Distinct actor/UID keeps all pre-death events on the original side. Never touches owned pieces or pools. */
export function claimExecutionPuppet(ctx:CombatContext,source:Fighter,victim:Fighter,wasEgg:boolean,supportTriggered:boolean){
  const state=source.reaper;
  if(!state||source.star<2||source.executionPuppet||victim.hp>0||victim.summon||victim.executionPuppet||
    wasEgg||supportTriggered||victim.defId==="blastbug")return false;
  const duration=EXECUTION.puppetDuration[source.star-1],copy=structuredClone(victim);
  copy.uid=Math.max(...ctx.fighters.map(f=>f.uid))+1;copy.side=source.side;copy.homeSide=source.side;
  copy.executionPuppet={owner:source.uid,victim:victim.uid,born:ctx.tick,until:ctx.tick+duration};
  copy.hp=1;copy.mana=0;copy.shield=0;copy.damage=0;copy.healing=0;copy.absorbed=0;copy.cooldown=0;copy.flash=false;
  copy.immortal={duration,until:ctx.tick+duration,spent:true};
  copy.supportHeal=0;copy.supportMana=0;copy.reflection=0;copy.stunUntil=0;copy.silenceUntil=0;copy.manaLockUntil=0;
  for(const key of ["reaper","reaperMarks","charm","command","corrosion","knockup","jungleLandings","taunt","gazed","burn","slow","thornRoot","spiritWards","combo","windup",
    "gospelAura","bulwark","spiritWard","tortoise","gaze","thornbind","boneblast","wildfire","tornado","warcry","terminator","bombardment","secretOrb","shuriken","jungle","storm","tar","aurora","qiSkill"] as const)delete copy[key];
  if(copy.siege)copy.siege={formed:0,fired:0,impacts:0,splashHits:0,splashDamage:0,interrupted:0,shells:[],...(copy.siege.mode?{mode:true}:{})};
  delete copy.attackSlows;
  delete copy.mendHaste;
  if(copy.inferno)copy.inferno=emptyInferno();
  if(copy.mending)copy.mending=emptyMending();
  if(copy.formless)copy.formless=emptyFormless();
  if(copy.air)delete copy.air.cast;
  if(copy.rifle)copy.rifle.shots=0;
  if(copy.hive)copy.hive={volleys:0,needles:0,explosions:0,innerHits:0,outerHits:0,interrupted:0};
  if(copy.wushi){copy.wushi.forms=0;copy.wushi.sweeps=0;copy.wushi.splashHits=0;if(copy.wushi.taunts!==undefined)copy.wushi.taunts=0;delete copy.wushi.casting;}
  if(copy.taotie)copy.taotie.feasts=0;
  if(copy.signature){copy.signature.casts=0;copy.signature.attacks=0;copy.signature.concealed=false;}
  ctx.fighters.push(copy);state.puppets++;
  ctx.effects.push({source:source.uid,target:copy.uid,kind:"immortal",name:"刑傀复起",amount:duration/4,from:{x:victim.x,y:victim.y},to:{x:copy.x,y:copy.y}});
  return true;
}
export function expireExecutionMarks(ctx:CombatContext){
  for(const f of ctx.fighters)if(f.reaperMarks){
    f.reaperMarks=f.hp<=0||isUndying(f)||isPhoenixEgg(f)?[]:f.reaperMarks.filter(m=>ctx.fighters.some(s=>s.uid===m.source&&s.hp>0));
    if(!f.reaperMarks.length)delete f.reaperMarks;
  }
}
