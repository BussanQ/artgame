import type {Fighter} from "../engine/types";
import {INFERNO} from "../data/skills";
import {infernoActive,attackSlowRate} from "../engine/inferno";
import {project} from "./projection";
import {REST_POSE,type AttackPose} from "./melee";

/** Raised fists, then a short low slam; all sampling uses battle time, including rewind. */
export function infernoPose(f:Pick<Fighter,"inferno">,time:number):AttackPose{
 const cast=f.inferno?.casting;
 if(cast){const t=Math.min(1,Math.max(0,(time-cast.start)/INFERNO.windup));return {...REST_POSE,lift:12*t,rotation:-0.09*t,scaleX:1-0.07*t,scaleY:1+0.12*t};}
 const age=f.inferno?.pulse?time-f.inferno.pulse.tick:10;
 if(age<0||age>=2)return {...REST_POSE};
 const slam=Math.sin(age/2*Math.PI);return {...REST_POSE,lift:-8*slam,scaleX:1+0.12*slam,scaleY:1-0.12*slam,impact:slam};
}
function circle(c:CanvasRenderingContext2D,center:{x:number;y:number},radius:number){
 c.beginPath();for(let i=0;i<=48;i++){const a=i/48*Math.PI*2,p=project(center.x+0.5+Math.cos(a)*radius,center.y+0.5+Math.sin(a)*radius);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y);}c.closePath();
}
export function drawInfernos(c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reduced:boolean){
 c.save();
 const corners=[[0,0],[8,0],[8,8],[0,8]].map(([x,y])=>project(x,y));c.beginPath();corners.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.clip();
 for(const f of fighters){
  const state=f.inferno,cast=state?.casting,pulse=state?.pulse;
  if(cast&&f.hp>0){c.globalAlpha=0.6;c.strokeStyle="#ffc57b";c.lineWidth=1.8;c.setLineDash([4,4]);circle(c,f,INFERNO.radius);c.stroke();c.setLineDash([]);}
  if(pulse&&time>=pulse.tick&&time-pulse.tick<3){
   const t=(time-pulse.tick)/3;c.globalAlpha=(1-t)*0.9;c.strokeStyle="#ffc980";c.fillStyle="#f79c4325";c.lineWidth=3;
   circle(c,pulse,INFERNO.radius*(reduced?1:0.35+t*0.65));c.fill();c.stroke();
   if(!reduced){c.strokeStyle="#ffad65";for(let i=0;i<8;i++){const a=i*Math.PI/4,from=project(pulse.x+0.5+Math.cos(a)*0.3,pulse.y+0.5+Math.sin(a)*0.3),to=project(pulse.x+0.5+Math.cos(a)*t,pulse.y+0.5+Math.sin(a)*t);c.beginPath();c.moveTo(from.x,from.y);c.lineTo(to.x,to.y);c.stroke();}}
  }
  if(infernoActive(f,time)){
   const p=project(f.x+0.5,f.y+0.65);c.globalAlpha=0.7;c.strokeStyle="#ffb568";c.lineWidth=2;c.beginPath();c.ellipse(p.x,p.y,34,12,0,0,Math.PI*2);c.stroke();
   if(!reduced){c.fillStyle="#ffd586";for(let i=0;i<6;i++){const t=(time*0.13+i/6)%1,a=i*Math.PI/3;c.globalAlpha=(1-t)*0.6;c.beginPath();c.arc(p.x+Math.cos(a)*24,p.y-10-t*65,1.5,0,Math.PI*2);c.fill();}}
  }
  const rate=attackSlowRate(f,time);
  if(f.hp>0&&rate){const p=project(f.x+0.5,f.y+0.65);c.globalAlpha=0.9;c.strokeStyle="#ffb674";c.lineWidth=2;c.beginPath();c.moveTo(p.x-8,p.y-110);c.lineTo(p.x-8,p.y-100);c.lineTo(p.x-12,p.y-104);c.moveTo(p.x-8,p.y-100);c.lineTo(p.x-4,p.y-104);c.stroke();}
 }
 c.restore();
}
export function infernoLabels(f:Fighter,time:number){
 const labels:string[]=[],s=f.inferno,rate=attackSlowRate(f,time);
 if(s){labels.push(`炎狱震地 ${s.formed}次 · 有效命中 ${s.hits}人次 · 减速施加 ${s.slows}人次`,`狂怒额外吸血 ${s.healing}生命`);
  if(s.casting)labels.push(`炎狱蓄势 ${Math.max(0,(s.casting.release-time)/4).toFixed(2)}s`);
  if(infernoActive(f,time))labels.push(`炎狱狂怒 ${Math.max(0,(s.active!.until-time)/4).toFixed(1)}s · 攻速+20% · 普攻吸血+10%`);
  if((f.skillReadyAt??0)>time&&!f.executionPuppet)labels.push(`炎狱冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
  if(s.interrupted)labels.push(`炎狱中断 ${s.interrupted}次`);
 }
 if(rate)labels.push(`炎狱减攻速 ${Math.round(rate*100)}% · 独立计时，最强生效`);
 return labels;
}
