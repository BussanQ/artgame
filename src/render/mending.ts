import {MENDING} from "../data/skills";
import {mendingHaste} from "../engine/mending";
import type {Fighter} from "../engine/types";
import {project} from "./projection";
import {REST_POSE,type AttackPose} from "./melee";
export function mendingPose(f:Pick<Fighter,"mending">,time:number):AttackPose{
 const cast=f.mending?.casting;if(!cast)return {...REST_POSE};
 const t=Math.max(0,Math.min(1,(time-cast.start)/MENDING.windup));
 return {...REST_POSE,lift:5+t*6,rotation:-0.06*t,scaleX:1+0.06*t,scaleY:1-0.06*t};
}
export function drawMendings(c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reduced:boolean){
 c.save();
 for(const source of fighters){
  const cast=source.mending?.casting,pulse=source.mending?.pulse;
  const activePulse=pulse&&time>=pulse.tick&&time-pulse.tick<3?pulse:undefined;
  const target=cast?fighters.find(f=>f.uid===cast.target):undefined;
  const from=cast?source:activePulse?.from,to=target??activePulse?.to;
  if(from&&to){
   const a=project(from.x+0.5,from.y+0.5),b=project(to.x+0.5,to.y+0.5),age=activePulse?(time-activePulse.tick)/3:0;
   c.globalAlpha=cast?0.55:0.85*(1-age);c.strokeStyle="#81efe0";c.lineWidth=cast?1.5:3;c.setLineDash(cast?[4,4]:[]);
   if(source.uid===(cast?.target??activePulse?.target)){c.beginPath();c.ellipse(b.x,b.y-35,25,38,0,0,Math.PI*2);c.stroke();}
   else{c.beginPath();c.moveTo(a.x,a.y-52);c.quadraticCurveTo((a.x+b.x)/2,(a.y+b.y)/2-80,b.x,b.y-40);c.stroke();}
   c.setLineDash([]);
   if(activePulse&&!reduced){c.fillStyle="#c2fff1";c.fillRect(b.x-8,b.y-60-age*25,16,4);c.fillRect(b.x-2,b.y-66-age*25,4,16);}
  }
 }
 for(const f of fighters)if(mendingHaste(f,time)>0){
  const p=project(f.x+0.5,f.y+0.65);c.globalAlpha=0.7;c.strokeStyle="#8ce6ed";c.lineWidth=1.8;c.beginPath();c.ellipse(p.x,p.y,33,11,0,0,Math.PI*2);c.stroke();
  if(!reduced){const t=Math.sin(time*0.7)*2;c.beginPath();for(let i=0;i<2;i++){c.moveTo(p.x+22+i*6,p.y-62+t);c.lineTo(p.x+26+i*6,p.y-67+t);c.lineTo(p.x+30+i*6,p.y-62+t);}c.stroke();}
 }
 c.restore();
}
export function mendingLabels(f:Fighter,time:number){
 const labels:string[]=[],s=f.mending;
 if(s){labels.push(`灵蕴缝合 ${s.completed}次 · 实际治疗 ${s.healing}生命 · 实际充能 ${Math.round(s.energy)}`,`加速施加 ${s.hastes}人次`);
  if(s.casting)labels.push(`锁定主力 · 缝合蓄势 ${Math.max(0,(s.casting.release-time)/4).toFixed(2)}s`);
  if((f.skillReadyAt??0)>time&&!f.executionPuppet)labels.push(`缝合冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
  if(s.interrupted)labels.push(`缝合中断 ${s.interrupted}次`);if(s.missed)labels.push(`缝合落空 ${s.missed}次`);
 }
 const active=(f.mendHaste??[]).filter(g=>g.until>time),rate=mendingHaste(f,time);
 if(rate){const until=Math.max(...active.filter(g=>g.ratio===rate).map(g=>g.until));labels.push(`灵蕴加速 +${Math.round(rate*100)}% · ${Math.max(0,(until-time)/4).toFixed(1)}s · 同类取最强`);}
 return labels;
}
