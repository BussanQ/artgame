import type {Fighter} from "../engine/types";
import {EXECUTION} from "../data/skills";
import {project} from "./projection";
import {REST_POSE,type AttackPose} from "./melee";
export function executionPose(f:Pick<Fighter,"reaper">,time:number):AttackPose{
 const cast=f.reaper?.casting;if(!cast)return {...REST_POSE};
 const t=Math.max(0,Math.min(1,(time-cast.start)/(cast.release-cast.start)));
 return {...REST_POSE,alpha:0.35,rotation:-0.14-0.25*t,lift:6,scaleX:0.9,scaleY:1.06,trail:0.5};
}
export function drawExecutionMarks(c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reducedMotion:boolean){
 c.save();
 for(const f of fighters){
  if(f.hp<=0)continue;
  const p=project(f.x+0.5,f.y+0.65),count=Math.max(0,...(f.reaperMarks??[]).map(m=>m.stacks));
  if(count){
   c.fillStyle=count>=EXECUTION.marks?"#f9c47f":"#b2e6ed";
   for(let i=0;i<EXECUTION.marks;i++){
    c.globalAlpha=i<count?0.95:0.25;c.beginPath();c.moveTo(p.x+(i-1)*9,p.y-104);c.lineTo(p.x+(i-1)*9+3,p.y-100);c.lineTo(p.x+(i-1)*9,p.y-96);c.lineTo(p.x+(i-1)*9-3,p.y-100);c.closePath();c.fill();
   }
  }
  if(f.executionPuppet){
   const remaining=Math.max(0,(f.executionPuppet.until-time)/(f.executionPuppet.until-f.executionPuppet.born));
   c.strokeStyle="#a3dfef";c.globalAlpha=0.75;c.lineWidth=2;c.beginPath();c.ellipse(p.x,p.y,34,12,0,-Math.PI/2,-Math.PI/2+Math.PI*2*remaining);c.stroke();
   if(!reducedMotion){c.globalAlpha=0.3;c.beginPath();c.ellipse(p.x,p.y-25-Math.sin(time*0.7)*3,25,32,0,0,Math.PI*2);c.stroke();}
  }
 }
 c.restore();
}
export function executionLabels(f:Fighter,time:number){
 const labels:string[]=[],state=f.reaper;
 if(state){
  labels.push(`施印 ${state.marks}层 · 真伤普攻 ${state.trueHits}次 / ${state.trueDamage}生命伤害`,`刑杀 ${state.executions}次 · 满印 ${state.enhanced}次 · 刑傀 ${state.puppets}人`);
  if(state.casting)labels.push(`刑杀潜行 ${Math.max(0,(state.casting.release-time)/4).toFixed(2)}s · 可受范围伤害`);
  if((f.skillReadyAt??0)>time)labels.push(`刑杀冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
  if(state.interrupted)labels.push(`刑杀中断 ${state.interrupted}次`);if(state.missed)labels.push(`刑杀落空 ${state.missed}次`);
 }
 if(f.reaperMarks?.length)labels.push(`死亡印记 ${Math.max(...f.reaperMarks.map(m=>m.stacks))}/${EXECUTION.marks}${f.reaperMarks.length>1?` · ${f.reaperMarks.length}名勾魂使分别叠印`:""}`);
 if(f.executionPuppet)labels.push(`刑傀残魂 ${Math.max(0,(f.executionPuppet.until-time)/4).toFixed(1)}s · 不能施法或回能`);
 return labels;
}
