import {HIVE} from "../data/skills";
import {combatAttack,damage,effect,interruptAirSkill,type CombatContext} from "./abilities";
import {attackTargets} from "./triggers";
import type {Fighter} from "./types";

type Center={x:number;y:number};
export function hiveBand(center:Center,target:Center,inner:number,outer:number){
  const d2=(target.x-center.x)**2+(target.y-center.y)**2;
  return d2<=inner*inner+1e-9?"inner":d2<=outer*outer+1e-9?"outer":undefined;
}
export function hiveCanCast(ctx:CombatContext,source:Fighter){
  return attackTargets(source,ctx.fighters,ctx.tick).some(f=>
    hiveBand(source,f,HIVE.inner[source.star-1],HIVE.outer[source.star-1]));
}
function emitNeedle(ctx:CombatContext,source:Fighter,target:Fighter){
  source.hive!.needles++;
  damage(ctx,source,target,combatAttack(source,ctx.tick),"physical",false,true);
}
/** One attack action starts a burst; only the ordinary battle loop grants attack energy. */
export function startHiveBurst(ctx:CombatContext,source:Fighter,target:Fighter){
  const state=source.hive;if(!state)return false;
  state.volleys++;emitNeedle(ctx,source,target);
  if(source.hp>0&&target.hp>0)state.burst={target:target.uid,next:ctx.tick+HIVE.needleInterval,
    remaining:HIVE.needlesPerAttack-1,side:source.side};
  return true;
}
export function beginHiveCast(ctx:CombatContext,source:Fighter){
  const state=source.hive;if(!state)return;
  delete state.burst;
  state.casting={start:ctx.tick,release:ctx.tick+HIVE.windup,side:source.side,center:{x:source.x,y:source.y},
    inner:HIVE.inner[source.star-1],outer:HIVE.outer[source.star-1],
    innerDamage:HIVE.innerDamage[source.star-1]*source.skillPower,outerDamage:HIVE.outerDamage[source.star-1]*source.skillPower};
  source.skillReadyAt=ctx.tick+HIVE.cooldown;
}
export function expireHiveStates(ctx:CombatContext){
  for(const f of ctx.fighters){
    const state=f.hive;if(!state)continue;
    if(state.pulse&&state.pulse.until<=ctx.tick)delete state.pulse;
    if(state.casting&&(f.hp<=0||f.stunUntil>ctx.tick||(f.silenceUntil??0)>ctx.tick||f.charm||f.side!==state.casting.side))
      interruptAirSkill(ctx,f);
    if(state.burst&&(f.hp<=0||f.stunUntil>ctx.tick||f.side!==state.burst.side))delete state.burst;
  }
}
export function advanceHiveSkills(ctx:CombatContext){
  expireHiveStates(ctx);
  for(const source of ctx.fighters){
    const state=source.hive,cast=state?.casting;if(!state||!cast||cast.release>ctx.tick)continue;
    delete state.casting;state.actedAt=ctx.tick;state.explosions++;
    state.pulse={start:ctx.tick,until:ctx.tick+6,center:cast.center,inner:cast.inner,outer:cast.outer};
    effect(ctx,source,source,"pulse",cast.outer,HIVE.name);
    const targets=ctx.fighters.filter(f=>f.hp>0&&f.side!==cast.side).map(f=>({f,band:hiveBand(cast.center,f,cast.inner,cast.outer)}));
    for(const {f,band} of targets){
      if(!band)continue;
      if(band==="inner")state.innerHits++;else state.outerHits++;
      // The pulse is already released: lethal reflection cannot cancel other simultaneous contacts.
      damage(ctx,source,f,band==="inner"?cast.innerDamage:cast.outerDamage,"magic",true,false,0,false,false,false,false,0,true);
    }
  }
}
export function advanceHiveAction(ctx:CombatContext,source:Fighter){
  const state=source.hive;if(!state)return false;
  if(state.casting||state.actedAt===ctx.tick)return true;
  const burst=state.burst;if(!burst)return false;
  const target=attackTargets(source,ctx.fighters,ctx.tick).find(f=>f.uid===burst.target&&Math.abs(f.x-source.x)+Math.abs(f.y-source.y)<=source.range);
  if(!target||source.hp<=0||source.stunUntil>ctx.tick||source.side!==burst.side){delete state.burst;return true;}
  if(burst.next>ctx.tick)return true;
  emitNeedle(ctx,source,target);burst.remaining--;burst.next+=HIVE.needleInterval;
  if(burst.remaining===0||source.hp<=0||target.hp<=0)delete state.burst;
  return true;
}
