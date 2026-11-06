import type {CombatContext} from "./abilities";
import type {Fighter} from "./types";
import {attackTargets} from "./triggers";
import {isUndying} from "./immortality";
import {isPhoenixEgg} from "./phoenix";
import {bladeStormActive} from "./swordthrall";

/** Redirect future actions only. Already released missiles and channels keep their targets. */
export function tauntTarget(ctx:CombatContext,victim:Fighter){
  const taunt=victim.taunt;
  if(!taunt||taunt.until<=ctx.tick||victim.hp<=0||isUndying(victim)||
      isPhoenixEgg(victim)||bladeStormActive(victim,ctx.tick))return undefined;
  const source=ctx.fighters.find(f=>f.uid===taunt.source);
  const active=source&&source.hp>0&&(taunt.kind==="bulwark"
    ? !!source.bulwark&&source.bulwark.until>ctx.tick
    : !!source.wushi&&source.wushi.until>ctx.tick);
  if(!source||!active||isUndying(source)||isPhoenixEgg(source)||source.side===victim.side||
      !attackTargets(victim,ctx.fighters,ctx.tick).some(f=>f.uid===source.uid))return undefined;
  return source;
}
export function expireTaunts(ctx:CombatContext){
  for(const victim of ctx.fighters)if(victim.taunt&&!tauntTarget(ctx,victim))delete victim.taunt;
}
