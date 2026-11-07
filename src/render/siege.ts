import type {Fighter} from "../engine/types";
import {SIEGE} from "../data/skills";
import {REST_POSE,type AttackPose} from "./melee";
import {project} from "./projection";

export function siegePose(f:Pick<Fighter,"siege">,time:number):AttackPose{
 const state=f.siege;if(!state)return {...REST_POSE};
 if(state.casting){const t=Math.min(1,Math.max(0,(time-state.casting.start)/SIEGE.windup));return {...REST_POSE,scaleX:1+t*0.08,scaleY:1-t*0.06,lift:-t*2};}
 const age=state.shot?time-state.shot.start:10;
 const recoil=age>=0&&age<2?Math.sin(age/2*Math.PI):0;
 return {...REST_POSE,forward:-recoil*9,rotation:recoil*0.035,scaleY:1-recoil*0.04};
}
export function drawSieges(c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reduced:boolean){
 c.save();
 for(const f of fighters){
  const state=f.siege;if(!state)continue;
  for(const shell of state.shells){
   if(time<shell.start||time>=shell.landAt)continue;
   const from=project(shell.from.x+0.5,shell.from.y+0.5),to=project(shell.to.x+0.5,shell.to.y+0.5);
   c.globalAlpha=0.55;c.strokeStyle=shell.side===0?"#efcd84":"#ff9b72";c.lineWidth=1.5;
   c.setLineDash([4,4]);c.beginPath();c.ellipse(to.x,to.y,36,16,0,0,Math.PI*2);c.stroke();c.setLineDash([]);
   if(reduced)continue;
   const t=(time-shell.start)/(shell.landAt-shell.start),x=from.x+(to.x-from.x)*t,y=from.y+(to.y-from.y)*t-62*(1-t)-Math.sin(t*Math.PI)*65;
   c.globalAlpha=1;c.fillStyle="#fff0b2";c.shadowColor="#ffc56d";c.shadowBlur=10;
   c.beginPath();c.arc(x,y,5,0,Math.PI*2);c.fill();c.shadowBlur=0;
  }
  if(state.pulse&&time>=state.pulse.tick&&time-state.pulse.tick<2.5){
   const t=(time-state.pulse.tick)/2.5,at=project(state.pulse.x+0.5,state.pulse.y+0.5),r=reduced?0.8:0.35+t;
   c.globalAlpha=0.8*(1-t);c.strokeStyle="#ffc681";c.lineWidth=3;
   c.beginPath();c.ellipse(at.x,at.y,45*r,20*r,0,0,Math.PI*2);c.stroke();
  }
 }
 c.restore();
}
export function siegeLabels(f:Fighter,time:number){
 const state=f.siege;if(!state)return [];
 const labels=[`架设 ${state.formed}次 · 炮弹发射 ${state.fired}枚 / 落地 ${state.impacts}枚`,`溅射命中 ${state.splashHits}人次 · 实际生命伤害 ${state.splashDamage}`];
 if(state.casting)labels.push(`架设中 ${Math.max(0,(state.casting.release-time)/4).toFixed(2)}s`);
 if(state.mode)labels.push(`攻城炮台 · 全场射程 · 攻击+${SIEGE.attack[f.star-1]} · 攻速+40% · 不再回能`);
 else if((f.skillReadyAt??0)>time)labels.push(`架设冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
 if(state.shells.length)labels.push(`在途炮弹 ${state.shells.length}枚 · 固定落点`);
 if(state.interrupted)labels.push(`架设中断 ${state.interrupted}次`);
 return labels;
}
