import {DREAM} from "../data/skills";
import {effect,interruptAirSkill,type CombatContext} from "./abilities";
import {attackTargets} from "./triggers";
import {isUndying} from "./immortality";
import {isPhoenixEgg} from "./phoenix";
import {bladeStormActive} from "./swordthrall";
import type {Fighter} from "./types";

const distance=(a:Fighter,b:Fighter)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export const emptyDream=():NonNullable<Fighter["dream"]>=>({selections:0,controls:0,taunts:0,released:0,cleansed:0,hits:0,damage:0,shieldDamage:0});

/** A cast-local draw: replay-stable, independent of array order and campaign RNG. */
export function dreamTarget(ctx:CombatContext,source:Fighter){
  const candidates=attackTargets(source,ctx.fighters,ctx.tick)
    .filter(f=>!f.summon&&!f.executionPuppet&&!f.charm&&!isUndying(f)&&
      !isPhoenixEgg(f)&&!bladeStormActive(f,ctx.tick)&&distance(source,f)<=source.range)
    .sort((a,b)=>a.uid-b.uid);
  if(!candidates.length)return undefined;
  let n=(Math.imul(source.uid,374761393)^Math.imul(ctx.tick,668265263)^Math.imul((source.dream?.selections??0)+1,1597334677))>>>0;
  n=Math.imul(n^(n>>>13),1274126177)>>>0;
  return candidates[((n^(n>>>16))>>>0)%candidates.length];
}

export function dreamCanCast(ctx:CombatContext,source:Fighter){
  return !!source.dream&&source.charmCast==="ready"&&source.hp>0&&!source.charm&&
    !source.executionPuppet&&!isUndying(source)&&!isPhoenixEgg(source)&&
    source.stunUntil<=ctx.tick&&(source.silenceUntil??0)<=ctx.tick&&(source.skillReadyAt??0)<=ctx.tick;
}

export function releaseDream(ctx:CombatContext,target:Fighter,reason:"expired"|"source-lost"|"target-lost"|"cleanse"){
  const mark=target.charm;
  if(mark?.source===undefined)return false;
  const owner=ctx.fighters.find(f=>f.uid===mark.source);
  target.side=mark.side;
  // New charm adds a separate attack multiplier; never roll back subsequent base growth.
  delete target.charm;
  for(const f of ctx.fighters)if(f.taunt?.kind==="dream"&&f.taunt.source===target.uid)delete f.taunt;
  if(owner?.dream){owner.dream.released++;if(reason==="cleanse")owner.dream.cleansed++;}
  effect(ctx,owner??target,target,"cleanse",0,reason==="cleanse"?"迷梦驱散":reason==="source-lost"?"蛛丝断开":"迷梦解除");
  return true;
}

/** Runs on the lethal hit, before a controller could turn into an undying body. */
export function releaseDreamsFrom(ctx:CombatContext,sourceUid:number){
  for(const target of ctx.fighters)if(target.charm?.source===sourceUid)releaseDream(ctx,target,"source-lost");
}

export function advanceDreams(ctx:CombatContext){
  for(const target of ctx.fighters){
    const mark=target.charm;
    if(mark?.source===undefined)continue;
    const owner=ctx.fighters.find(f=>f.uid===mark.source);
    if(target.hp<=0||isUndying(target)||isPhoenixEgg(target))releaseDream(ctx,target,"target-lost");
    else if(!owner||owner.hp<=0||owner.charm||isUndying(owner)||isPhoenixEgg(owner)||owner.side!==target.side)
      releaseDream(ctx,target,"source-lost");
    else if(mark.until<=ctx.tick)releaseDream(ctx,target,"expired");
  }
}

export function beginDream(ctx:CombatContext,source:Fighter,target:Fighter){
  if(!source.dream)return;
  interruptAirSkill(ctx,target);
  source.dream.selections++;source.dream.controls++;
  source.charmCast="spent";
  source.skillReadyAt=ctx.tick+DREAM.cooldown;
  target.charm={source:source.uid,until:ctx.tick+DREAM.duration[source.star-1],attack:target.attack,side:target.side,bonus:DREAM.attack[source.star-1]};
  target.side=source.side;
  // A converted spider cannot keep another victim permanently attached to the wrong team.
  releaseDreamsFrom(ctx,target.uid);
  for(const enemy of attackTargets(target,ctx.fighters,ctx.tick)){
    if(distance(target,enemy)>DREAM.tauntRadius||isUndying(enemy)||isPhoenixEgg(enemy)||bladeStormActive(enemy,ctx.tick))continue;
    enemy.taunt={source:target.uid,until:ctx.tick+DREAM.tauntDuration,kind:"dream"};
    source.dream.taunts++;
    effect(ctx,target,enemy,"taunt",DREAM.tauntDuration/4,"迷梦引火");
  }
}

/** Display separately from the spider's own damage; the hit remains owned by its real actor. */
export function recordDreamHit(ctx:CombatContext,actor:Fighter,damage:number,absorbed:number){
  const mark=actor.charm;
  if(mark?.source===undefined||mark.until<=ctx.tick||damage+absorbed<=0)return;
  const owner=ctx.fighters.find(f=>f.uid===mark.source);
  if(owner?.dream){owner.dream.hits++;owner.dream.damage+=damage;owner.dream.shieldDamage+=absorbed;}
}
