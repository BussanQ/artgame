import {attackInterval,castSkill,type CombatContext} from "./abilities";
import {isPhoenixEgg} from "./phoenix";
import type {Fighter} from "./types";

/** Friendly/self abilities do not need an enemy placeholder to select their real target. */
function hasFriendlyAction(source:Fighter){
 return !!(source.mending||source.formless||source.spiritWard||source.defId==="medic"&&source.air);
}

/** Called once for an idle actor with no visible enemy; never fires an ordinary attack. */
export function advanceWithoutTarget(ctx:CombatContext,source:Fighter){
 if(source.hp<=0||isPhoenixEgg(source)||source.air?.cast||source.spiritWard?.channel||
   source.spiritWard?.actedAt===ctx.tick||source.mending?.casting||source.mending?.actedAt===ctx.tick)return false;
 // Waiting for a visible target still consumes elapsed attack cooldown, including while stunned.
 if(source.cooldown>0)source.cooldown--;
 if(source.cooldown>0||source.stunUntil>ctx.tick||!hasFriendlyAction(source))return false;
 // The ability retains its own energy, cooldown, ally-range, silence and taunt checks.
 if(!castSkill(ctx,source,source))return false;
 source.cooldown+=attackInterval(source,ctx.tick);
 return true;
}
