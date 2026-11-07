import {FORMLESS} from "../data/skills";
import {isUndying} from "./immortality";
import {isPhoenixEgg} from "./phoenix";
import type {CombatContext} from "./abilities";
import type {Fighter} from "./types";

export const emptyFormless=():NonNullable<Fighter["formless"]>=>({activations:0,hits:0,damage:0,shieldDamage:0});
export const formlessActive=(f:Fighter,tick:number)=>
 f.hp>0&&!isUndying(f)&&!isPhoenixEgg(f)&&!!f.formless?.active&&f.formless.active.start<=tick&&f.formless.active.until>tick;
export const formlessHaste=(f:Fighter,tick:number)=>formlessActive(f,tick)?FORMLESS.haste[f.star-1]:0;
export function formlessCanCast(ctx:CombatContext,source:Fighter){
 return !!source.formless&&!source.executionPuppet&&source.hp>0&&!isUndying(source)&&!isPhoenixEgg(source)&&
 !source.charm&&source.stunUntil<=ctx.tick&&(source.silenceUntil??0)<=ctx.tick&&(source.skillReadyAt??0)<=ctx.tick&&!formlessActive(source,ctx.tick);
}
export function beginFormless(ctx:CombatContext,source:Fighter){
 if(!formlessCanCast(ctx,source))return false;
 source.formless!.activations++;source.formless!.active={start:ctx.tick,until:ctx.tick+FORMLESS.duration};
 source.skillReadyAt=ctx.tick+FORMLESS.cooldown;
 ctx.effects.push({source:source.uid,target:source.uid,kind:"haste",name:"无形",amount:FORMLESS.haste[source.star-1]*100,from:{x:source.x,y:source.y},to:{x:source.x,y:source.y}});
 return true;
}
export function advanceFormless(ctx:CombatContext){
 for(const f of ctx.fighters)if(f.formless?.active&&!formlessActive(f,ctx.tick))delete f.formless.active;
}
