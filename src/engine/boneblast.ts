import { BONEBLAST } from "../data/skills";
import { damage, effect, interruptAirSkill, type CombatContext } from "./abilities";
import { isUndying } from "./immortality";
import { isPhoenixEgg } from "./phoenix";
import { bladeStormActive } from "./swordthrall";
import type { Fighter } from "./types";

type Point = {x:number;y:number};
export function boneBlastContains(center:Point,target:Point) {
  return Math.hypot(center.x-target.x,center.y-target.y)<=BONEBLAST.radius+1e-9;
}
/** Fixed landing, not a tracking projectile; the destination's occupant may change. */
export function releaseBoneBlast(source:Fighter,tick:number) {
  const state=source.boneblast,cast=source.air?.cast;
  if(!state||cast?.kind!=="boneblast")return;
  delete source.air!.cast;
  const flight=Math.max(1,Math.ceil(Math.hypot(cast.to.x-cast.from.x,cast.to.y-cast.from.y)/BONEBLAST.speed));
  state.launched++;
  state.orbs.push({start:tick,landAt:tick+flight,from:{...cast.from},to:{...cast.to},damage:cast.damage,side:source.side});
}
/** Resolve committed circular explosions, including after death or lethal reflection. */
export function advanceBoneBlasts(ctx:CombatContext) {
  for(const source of ctx.fighters){
    const state=source.boneblast;if(!state)continue;
    const landed=state.orbs.filter(orb=>orb.landAt<=ctx.tick);
    state.orbs=state.orbs.filter(orb=>orb.landAt>ctx.tick);
    for(const orb of landed){
      state.detonated++;
      ctx.effects.push({source:source.uid,target:source.uid,kind:"pulse",name:BONEBLAST.name,
        amount:BONEBLAST.radius,from:{...orb.from},to:{...orb.to}});
      for(const target of ctx.fighters.filter(f=>f.hp>0&&f.side!==orb.side&&boneBlastContains(orb.to,f))
        .sort((a,b)=>a.uid-b.uid)){
        if(target.hp<=0||target.side===orb.side)continue;
        const shield=target.shield;
        const hurt=damage(ctx,source,target,orb.damage,"magic",true,false,0,false,false,false,false,0,true);
        if(hurt>0||target.shield<shield)state.hits++;
        if(target.hp<=0||isUndying(target)||isPhoenixEgg(target)||bladeStormActive(target,ctx.tick))continue;
        interruptAirSkill(ctx,target);
        target.stunUntil=Math.max(target.stunUntil,ctx.tick+BONEBLAST.stun);
        state.stuns++;effect(ctx,source,target,"stun",BONEBLAST.stun/4,"骨爆眩晕");
      }
    }
  }
}
