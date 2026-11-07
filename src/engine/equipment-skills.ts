import {ITEM,EQUIPMENT_SKILLS} from "../data/items";
import {damage,effect,type CombatContext} from "./abilities";
import {attackTargets} from "./triggers";
import {isUndying} from "./immortality";
import {isPhoenixEgg} from "./phoenix";
import {summonCells,spawnRetinue} from "./summons";
import type {Fighter} from "./types";

/** Duplicate copies keep base stats but create just one controller for each unique skill. */
export function initialEquipmentSkills(items:string[]=[]):Fighter["equipmentSkills"]{
  const result:NonNullable<Fighter["equipmentSkills"]>={};
  for(const id of new Set(items)){
    if(ITEM[id]?.effect==="resonance")result.resonance={readyAt:EQUIPMENT_SKILLS.opening,activations:0,damage:0,shieldDamage:0};
    if(ITEM[id]?.effect==="call")result.call={readyAt:EQUIPMENT_SKILLS.opening,activations:0,summoned:0};
  }
  return Object.keys(result).length?result:undefined;
}

export function equipmentTarget(ctx:CombatContext,source:Fighter){
  const targets=attackTargets(source,ctx.fighters,ctx.tick).sort((a,b)=>a.uid-b.uid);
  if(!targets.length)return undefined;
  let n=(Math.imul(source.uid,374761393)^Math.imul(ctx.tick,668265263)^Math.imul((source.equipmentSkills?.resonance?.activations??0)+1,1140671485))>>>0;
  n=Math.imul(n^(n>>>13),1274126177)>>>0;
  return targets[((n^(n>>>16))>>>0)%targets.length];
}

/** Independent equipment actions do not spend energy or replace a unit's ordinary action. */
export function advanceEquipmentSkills(ctx:CombatContext){
  const holders=ctx.fighters.filter(f=>f.equipmentSkills).sort((a,b)=>a.uid-b.uid);
  if(ctx.tick%2)holders.reverse();
  for(const source of holders){
    if(source.hp<=0||source.summon||source.executionPuppet||source.charm||
      source.stunUntil>ctx.tick||(source.silenceUntil??0)>ctx.tick||isUndying(source)||isPhoenixEgg(source))continue;
    const call=source.equipmentSkills!.call;
    if(call&&call.readyAt<=ctx.tick){
      const cells=summonCells(ctx,source,1);
      if(cells.length){
        const created=spawnRetinue(ctx,source,"puppet",cells,"wolf-fang");
        if(created){call.activations++;call.summoned+=created;call.readyAt=ctx.tick+EQUIPMENT_SKILLS.call.cooldown;}
      }
    }
    const resonance=source.equipmentSkills!.resonance;
    if(!resonance||resonance.readyAt>ctx.tick)continue;
    const target=equipmentTarget(ctx,source);if(!target)continue;
    resonance.activations++;resonance.readyAt=ctx.tick+EQUIPMENT_SKILLS.resonance.cooldown;
    effect(ctx,source,target,"equipment",EQUIPMENT_SKILLS.resonance.damage,"灵魂之晶·鞭笞");
    const start=ctx.events.length;
    const actual=damage(ctx,source,target,EQUIPMENT_SKILLS.resonance.damage,"magic",true);
    const packet=ctx.events.slice(start).find(e=>e.attacker===source.uid&&e.target===target.uid&&e.skill&&e.primary&&!e.reflected);
    if(packet){packet.item="soul-crystal";resonance.shieldDamage+=packet.absorbed;}
    resonance.damage+=actual;
  }
}
