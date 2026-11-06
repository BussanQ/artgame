import {BULWARK} from "../data/skills";
import type {CombatContext} from "./abilities";
import type {Fighter} from "./types";
import {attackTargets} from "./triggers";
import {isUndying} from "./immortality";
import {isPhoenixEgg} from "./phoenix";
import {bladeStormActive} from "./swordthrall";

export const bulwarkActive=(f:Pick<Fighter,"hp"|"bulwark">,tick:number)=>
  f.hp>0&&!!f.bulwark&&f.bulwark.until>tick;

/** Personal armor, not replenishing health or a damage-absorbing shield. */
export function beginBulwark(ctx:CombatContext,source:Fighter){
  const state=source.bulwark;if(!state)return false;
  state.start=ctx.tick;state.until=ctx.tick+BULWARK.duration[source.star-1];
  state.armor=BULWARK.armor[source.star-1];state.formations++;
  source.skillReadyAt=ctx.tick+BULWARK.cooldown;
  ctx.effects.push({source:source.uid,target:source.uid,kind:"fortify",name:BULWARK.name,amount:state.armor,
    from:{x:source.x,y:source.y},to:{x:source.x,y:source.y}});
  for(const victim of attackTargets(source,ctx.fighters,ctx.tick).filter(f=>
    Math.abs(f.x-source.x)+Math.abs(f.y-source.y)<=BULWARK.tauntRadius&&
    !isUndying(f)&&!isPhoenixEgg(f)&&!bladeStormActive(f,ctx.tick))){
    victim.taunt={source:source.uid,until:ctx.tick+BULWARK.tauntDuration,kind:"bulwark"};
    state.taunts++;
    ctx.effects.push({source:source.uid,target:victim.uid,kind:"taunt",name:"盾阵嘲讽",amount:BULWARK.tauntDuration/4,
      from:{x:source.x,y:source.y},to:{x:victim.x,y:victim.y}});
  }
  return true;
}
export function expireBulwarks(ctx:CombatContext){
  for(const source of ctx.fighters){
    const state=source.bulwark;
    if(state&&state.until>0&&(source.hp<=0||state.until<=ctx.tick)){
      state.until=0;state.armor=0;
    }
  }
}
