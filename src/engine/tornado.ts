import { TORNADO } from "../data/skills";
import { damage, effect, interruptAirSkill, type CombatContext } from "./abilities";
import { isUndying } from "./immortality";
import { isPhoenixEgg } from "./phoenix";
import { bladeStormActive } from "./swordthrall";
import type { Fighter } from "./types";

type Point={x:number;y:number};
type Vortex=NonNullable<Fighter["tornado"]>["vortices"][number];
/** Swept circular head: exact segment distance prevents tunneling and square diagonal corners. */
export function tornadoContact(vortex: Pick<Vortex,"from"|"dx"|"dy">,target: Point,start: number,end: number) {
  const x=target.x-vortex.from.x,y=target.y-vortex.from.y;
  const along=Math.max(start,Math.min(end,x*vortex.dx+y*vortex.dy));
  return Math.hypot(x-vortex.dx*along,y-vortex.dy*along)<=TORNADO.width/2+1e-9;
}
export function releaseTornado(source: Fighter,tick: number) {
  const state=source.tornado,cast=source.air?.cast;
  if(!state || cast?.kind!=="tornado")return;
  delete source.air!.cast;
  const dx=cast.to.x-cast.from.x,dy=cast.to.y-cast.from.y,length=Math.hypot(dx,dy);
  if(!length)return;
  state.launched++;
  state.vortices.push({start:tick,from:{...cast.from},dx:dx/length,dy:dy/length,
    traveled:0,damage:cast.damage,side:source.side,hit:[]});
}
/** Moving hazards survive source death; each victim's lift and landing are two separate stages. */
export function advanceTornadoes(ctx: CombatContext) {
  for(const source of ctx.fighters){
    const state=source.tornado;if(!state)continue;
    state.vortices=state.vortices.filter(vortex=>{
      const end=Math.min(TORNADO.length,vortex.traveled+TORNADO.speed);
      for(const target of ctx.fighters.filter(f=>f.hp>0 && f.side!==vortex.side &&
        !vortex.hit.includes(f.uid) && tornadoContact(vortex,f,vortex.traveled,end)).sort((a,b)=>a.uid-b.uid)){
        if(target.hp<=0 || target.side===vortex.side)continue;
        vortex.hit.push(target.uid);state.contacts++;
        damage(ctx,source,target,vortex.damage,"magic",true,false,0,false,false,false,false,0,true);
        if(target.hp<=0 || isUndying(target) || isPhoenixEgg(target) || bladeStormActive(target,ctx.tick))continue;
        interruptAirSkill(ctx,target);
        const landing=ctx.tick+TORNADO.flight;
        target.knockup={start:ctx.tick,until:Math.max(target.knockup?.until??0,landing)};
        target.stunUntil=Math.max(target.stunUntil,landing);
        (target.jungleLandings??=[]).push({source:source.uid,at:landing,duration:TORNADO.stun[source.star-1],kind:"tornado"});
        state.knockups++;effect(ctx,source,target,"stun",TORNADO.flight/4,"龙卷击飞");
      }
      vortex.traveled=end;
      return end<TORNADO.length;
    });
  }
}
