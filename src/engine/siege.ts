import {SIEGE} from "../data/skills";
import {combatAttack,damage,type CombatContext} from "./abilities";
import {isUndying} from "./immortality";
import {isPhoenixEgg} from "./phoenix";
import type {Fighter} from "./types";

export const emptySiege=():NonNullable<Fighter["siege"]>=>({formed:0,fired:0,impacts:0,splashHits:0,splashDamage:0,interrupted:0,shells:[]});
const controlled=(f:Fighter,tick:number)=>f.hp<=0||f.stunUntil>tick||(f.silenceUntil??0)>tick||!!f.charm||isUndying(f)||isPhoenixEgg(f);
export function beginSiege(ctx:CombatContext,source:Fighter){
 const state=source.siege;if(!state||state.mode||state.casting)return false;
 source.skillReadyAt=ctx.tick+SIEGE.cooldown;
 state.casting={start:ctx.tick,release:ctx.tick+SIEGE.windup,side:source.side};
 ctx.effects.push({source:source.uid,target:source.uid,kind:"windup",name:"攻城架设",amount:SIEGE.windup/4,from:{x:source.x,y:source.y},to:{x:source.x,y:source.y}});
 return true;
}
export function stopSiege(ctx:CombatContext,source:Fighter){
 const state=source.siege;if(!state?.casting)return;
 delete state.casting;state.interrupted++;state.actedAt=ctx.tick;
 ctx.effects.push({source:source.uid,target:source.uid,kind:"silence",name:"架设中断",amount:0,from:{x:source.x,y:source.y},to:{x:source.x,y:source.y}});
}
export function advanceSiegeForms(ctx:CombatContext){
 for(const source of ctx.fighters){
  const state=source.siege,cast=state?.casting;if(!state||!cast)continue;
  if(controlled(source,ctx.tick)||source.side!==cast.side){stopSiege(ctx,source);continue;}
  if(cast.release>ctx.tick)continue;
  delete state.casting;state.mode=true;state.formed++;state.actedAt=ctx.tick;
  source.range=SIEGE.range;source.mana=0;
  ctx.effects.push({source:source.uid,target:source.uid,kind:"transform",name:SIEGE.name,amount:0,from:{x:source.x,y:source.y},to:{x:source.x,y:source.y}});
 }
}
export function siegeActionBusy(ctx:CombatContext,source:Fighter){
 const state=source.siege;if(!state)return false;
 const occupied=!!state.casting||state.actedAt===ctx.tick;
 if(state.casting&&controlled(source,ctx.tick))stopSiege(ctx,source);
 return occupied;
}
/** Ordinary attacks launch real shells. Damage is frozen at launch; landing cells are fixed. */
export function launchSiegeShell(ctx:CombatContext,source:Fighter,target:Fighter){
 const state=source.siege;if(!state?.mode)return false;
 const from={x:source.x,y:source.y},to={x:target.x,y:target.y};
 const shot={start:ctx.tick,landAt:ctx.tick+Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/SIEGE.speed)),
  from,to,damage:combatAttack(source,ctx.tick),side:source.side};
 state.shells.push(shot);state.shot=shot;state.fired++;
 return true;
}
/** Committed ordinary explosions survive death/control. Each victim gets its own defense/lifesteal packet. */
export function advanceSiegeShells(ctx:CombatContext){
 for(const source of ctx.fighters){
  const state=source.siege;if(!state)continue;
  const landed=state.shells.filter(s=>s.landAt<=ctx.tick);
  state.shells=state.shells.filter(s=>s.landAt>ctx.tick);
  for(const shell of landed){
   state.impacts++;state.pulse={tick:ctx.tick,...shell.to};
   const contacts=ctx.fighters.filter(f=>f.hp>0&&f.side!==shell.side&&Math.hypot(f.x-shell.to.x,f.y-shell.to.y)<=SIEGE.radius+1e-9)
    .sort((a,b)=>Math.hypot(a.x-shell.to.x,a.y-shell.to.y)-Math.hypot(b.x-shell.to.x,b.y-shell.to.y)||a.uid-b.uid);
   for(const target of contacts){
    if(target.hp<=0||target.side===shell.side)continue;
    const primary=target.x===shell.to.x&&target.y===shell.to.y,at=ctx.events.length;
    const amount=damage(ctx,source,target,shell.damage*(primary?1:SIEGE.splash),"physical",false,primary,0,false,false,false,false,0,true,false,{side:shell.side,from:shell.from});
    if(!primary&&ctx.events.slice(at).some(e=>e.attacker===source.uid&&e.target===target.uid&&!e.immune&&!e.evaded&&(e.amount>0||e.absorbed>0))){state.splashHits++;state.splashDamage+=amount;}
   }
  }
 }
}
