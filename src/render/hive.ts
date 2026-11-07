import type {Fighter} from "../engine/types";
import {REST_POSE,type AttackPose} from "./melee";
import {project} from "./projection";

export function hivePose(f:Pick<Fighter,"hive">,time:number):AttackPose{
  const cast=f.hive?.casting;if(!cast)return {...REST_POSE};
  const charge=Math.max(0,Math.min(1,(time-cast.start)/(cast.release-cast.start)));
  return {...REST_POSE,lift:4+charge*3,rotation:-0.06*charge,scaleX:1-0.06*charge,scaleY:1+0.06*charge};
}
function ring(c:CanvasRenderingContext2D,center:{x:number;y:number},radius:number){
  c.beginPath();
  for(let i=0;i<=64;i++){
    const a=i/64*Math.PI*2,p=project(center.x+0.5+Math.cos(a)*radius,center.y+0.5+Math.sin(a)*radius);
    if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);
  }
  c.closePath();
}
export function drawHives(c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reducedMotion:boolean){
  c.save();const corners=[[0,0],[8,0],[8,8],[0,8]].map(([x,y])=>project(x,y));
  c.beginPath();corners.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.clip();
  for(const f of fighters){
    const cast=f.hive?.casting,pulse=f.hive?.pulse;
    const state=cast??(pulse&&pulse.until>time?pulse:undefined);if(!state)continue;
    const age=pulse&&!cast?Math.max(0,(time-pulse.start)/(pulse.until-pulse.start)):0;
    c.globalAlpha=cast?0.8:Math.max(0,1-age);c.lineWidth=cast?1.8:3;
    c.setLineDash(cast?[6,4]:[]);
    ring(c,state.center,state.outer);c.fillStyle="#8fdcb316";c.strokeStyle="#91d8b8";c.fill();c.stroke();
    ring(c,state.center,state.inner);c.fillStyle="#eab7522b";c.strokeStyle="#f1ce7d";c.fill();c.stroke();
    if(pulse&&!cast&&!reducedMotion){
      c.setLineDash([]);c.strokeStyle="#d8f8bb";ring(c,state.center,state.outer*(0.12+age*0.88));c.stroke();
      const p=project(state.center.x+0.5,state.center.y+0.5);c.fillStyle="#f1d27b";
      for(let i=0;i<12;i++){const a=i*Math.PI/6,t=project(state.center.x+0.5+Math.cos(a)*state.outer*age,state.center.y+0.5+Math.sin(a)*state.outer*age);
        c.beginPath();c.ellipse(t.x,t.y-6,3,1.5,Math.atan2(t.y-p.y,t.x-p.x),0,Math.PI*2);c.fill();}
    }
  }
  c.restore();
}
export function hiveLabels(f:Pick<Fighter,"hive"|"skillReadyAt">,time:number){
  const h=f.hive;if(!h)return [];
  const labels=[`连射 ${h.volleys}轮 · 发针 ${h.needles}次`,`震荡 ${h.explosions}次 · 内圈 ${h.innerHits}次 / 外圈 ${h.outerHits}次`];
  if(h.casting)labels.push(`蜂群蓄能 ${Math.max(0,(h.casting.release-time)/4).toFixed(2)}s`);
  if(h.burst)labels.push(`连射余针 ${h.burst.remaining}`);
  if(h.interrupted)labels.push(`蜂群蓄力中断 ${h.interrupted}次`);
  if((f.skillReadyAt??0)>time)labels.push(`震荡冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
  return labels;
}
