import {THORNBIND} from "../data/skills";
import {attackTargets} from "./triggers";
import {combatAttack,damage,effect,heal,interruptAirSkill,type CombatContext} from "./abilities";
import {isUndying} from "./immortality";
import {isPhoenixEgg} from "./phoenix";
import {bladeStormActive} from "./swordthrall";
import type {Fighter} from "./types";

const distance=(a:Fighter,b:Fighter)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export function thornBindPulseDamage(total:number,index:number){
  return Math.round(total*(index+1)/THORNBIND.pulses)-Math.round(total*index/THORNBIND.pulses);
}
export function beginThornBind(ctx:CombatContext,source:Fighter,target:Fighter){
  if(!source.thornbind)return;
  source.thornbind.channel={start:ctx.tick,next:ctx.tick+THORNBIND.windup,remaining:THORNBIND.pulses,
    target:target.uid,to:{x:target.x,y:target.y},damage:combatAttack(source,ctx.tick)*THORNBIND.multiplier*source.skillPower,side:source.side};
  source.skillReadyAt=ctx.tick+THORNBIND.cooldown;
}
function interrupted(source:Fighter,tick:number){
  return source.hp<=0||!!source.charm||source.stunUntil>tick||(source.silenceUntil??0)>tick||
    (source.thornbind?.channel&&source.side!==source.thornbind.channel.side);
}
/** Both windup and maintenance occupy the caster, including the final pulse's frame. */
export function advanceThornBindAction(ctx:CombatContext,source:Fighter){
  const state=source.thornbind;if(!state)return false;
  const occupied=!!state.channel||state.actedAt===ctx.tick;
  if(state.channel&&interrupted(source,ctx.tick))interruptAirSkill(ctx,source);
  return occupied;
}
export function advanceThornBinds(ctx:CombatContext){
  for(const f of ctx.fighters){
    if(f.thornRoot&&(f.hp<=0||f.thornRoot.until<=ctx.tick||f.stunUntil<=ctx.tick||isPhoenixEgg(f)))delete f.thornRoot;
    if(f.thornbind?.channel&&interrupted(f,ctx.tick))interruptAirSkill(ctx,f);
  }
  for(const source of ctx.fighters){
    const state=source.thornbind,cast=state?.channel;
    if(!state||!cast||cast.next>ctx.tick)continue;
    const candidates=attackTargets(source,ctx.fighters,ctx.tick).filter(f=>distance(source,f)<=source.range)
      .sort((a,b)=>distance(source,a)-distance(source,b)||a.uid-b.uid);
    const target=candidates.find(f=>f.uid===cast.target)??candidates[0];
    state.actedAt=ctx.tick;
    if(!target){delete state.channel;effect(ctx,source,source,"silence",0,"目标丢失");continue;}
    if(target.uid!==cast.target){state.retargets++;cast.target=target.uid;}
    cast.to={x:target.x,y:target.y};
    const raw=thornBindPulseDamage(cast.damage,THORNBIND.pulses-cast.remaining);
    cast.remaining--;cast.next+=THORNBIND.interval;state.pulses++;
    effect(ctx,source,target,"pulse",THORNBIND.root/4,THORNBIND.name);
    const shield=target.shield,hurt=damage(ctx,source,target,raw,"magic",true,false,0,false,false,true);
    if(hurt>0||target.shield<shield)state.hits++;
    if(target.hp>0&&!isUndying(target)&&!isPhoenixEgg(target)&&!bladeStormActive(target,ctx.tick)){
      interruptAirSkill(ctx,target);
      target.stunUntil=Math.max(target.stunUntil,ctx.tick+THORNBIND.root);
      target.thornRoot={source:source.uid,until:ctx.tick+THORNBIND.root};state.roots++;
      effect(ctx,source,target,"stun",THORNBIND.root/4,"藤蔓束缚");
    }
    // Lethal reflection can cancel this channel or turn the source into a soul.
    if(state.channel===cast&&!interrupted(source,ctx.tick)){
      const before=source.healing;heal(ctx,source,source,hurt,"荆棘汲取");state.healing+=source.healing-before;
    }
    if(cast.remaining===0&&state.channel===cast)delete state.channel;
  }
}
