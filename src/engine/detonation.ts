import {DETONATION} from "../data/skills";
import {damage,distance,effect,type CombatContext} from "./abilities";
import type {Fighter} from "./types";

export const emptyDetonation = ():NonNullable<Fighter["detonation"]> => ({
  explosions:0,hits:0,damage:0,shieldDamage:0,
});

/** Snapshot death allegiance and power before recursively resolving opposing death bursts. */
export function detonate(ctx:CombatContext,source:Fighter){
  const state=source.detonation;
  if(!state||source.hp>0||source.deathBurst!=="ready")return false;
  source.deathBurst="spent";
  state.explosions++;
  if(source.signature)source.signature.casts++;
  const origin={side:source.side,from:{x:source.x,y:source.y}};
  const raw=DETONATION.damage[source.star-1]*source.skillPower;
  effect(ctx,source,source,"cast",DETONATION.radius,"爆裂虫·自爆");
  const targets=ctx.fighters.filter(f=>f.hp>0&&f.side!==origin.side&&distance(f,origin.from)<=DETONATION.radius)
    .sort((a,b)=>a.uid-b.uid);
  for(const target of targets){
    if(target.hp<=0||target.side===origin.side)continue;
    const start=ctx.events.length;
    const actual=damage(ctx,source,target,raw,"magic",true,false,0,true,
      false,false,false,0,false,false,origin);
    const packet=ctx.events.slice(start).find(e=>e.attacker===source.uid&&e.target===target.uid&&!e.reflected);
    if(packet){
      state.shieldDamage+=packet.absorbed;
      if(actual>0||packet.absorbed>0)state.hits++;
    }
    state.damage+=actual;
  }
  return true;
}
