import {GAZE} from "../data/skills";
import {effect,interruptAirSkill,type CombatContext} from "./abilities";
import {attackTargets,usesEnergy} from "./triggers";
import {isUndying} from "./immortality";
import {isPhoenixEgg} from "./phoenix";
import {bladeStormActive} from "./swordthrall";
import type {Fighter} from "./types";

const distance=(a:Fighter,b:Fighter)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
/** A cast-local draw independent of campaign RNG, array order and other combat rolls. */
export function gazeTarget(ctx:CombatContext,source:Fighter){
  const candidates=attackTargets(source,ctx.fighters,ctx.tick)
    .filter(f=>distance(source,f)<=source.range&&!isUndying(f)&&!isPhoenixEgg(f)&&!bladeStormActive(f,ctx.tick))
    .sort((a,b)=>a.uid-b.uid);
  if(!candidates.length)return;
  let n=(Math.imul(source.uid,374761393)^Math.imul(ctx.tick,668265263)^Math.imul((source.gaze?.selections??0)+1,1274126177))>>>0;
  n=Math.imul(n^(n>>>13),1274126177)>>>0;n=(n^(n>>>16))>>>0;
  return candidates[n%candidates.length];
}
export function applyGaze(ctx:CombatContext,source:Fighter,target:Fighter){
  if(!source.gaze)return;
  const until=ctx.tick+GAZE.duration[source.star-1];
  source.gaze.selections++;source.gaze.controls++;source.skillReadyAt=ctx.tick+GAZE.cooldown;
  interruptAirSkill(ctx,target);
  target.stunUntil=Math.max(target.stunUntil,until);
  if(!target.gazed||until>=target.gazed.until)
    target.gazed={source:source.uid,until,nextDrain:ctx.tick+GAZE.drainInterval,drain:GAZE.drain};
  effect(ctx,source,target,"stun",GAZE.duration[source.star-1]/4,"凝视压制");
}
/** Resolve the final whole-second drain before removing a naturally expiring mark. */
export function advanceGazes(ctx:CombatContext){
  for(const target of ctx.fighters){
    const mark=target.gazed;if(!mark)continue;
    if(target.hp<=0||isUndying(target)||isPhoenixEgg(target)||bladeStormActive(target,ctx.tick)||
      mark.until<ctx.tick||(mark.until>ctx.tick&&target.stunUntil<=ctx.tick)){
      delete target.gazed;continue;
    }
    const source=ctx.fighters.find(f=>f.uid===mark.source);
    if(mark.nextDrain<=ctx.tick&&source){
      mark.nextDrain+=GAZE.drainInterval;
      const amount=usesEnergy(target)?Math.min(target.mana,mark.drain):0;
      if(amount>0){target.mana-=amount;if(source.gaze)source.gaze.manaDrained+=amount;
        effect(ctx,source,target,"drain",amount,"凝视削能");}
    }
    if(mark.until<=ctx.tick)delete target.gazed;
  }
}
