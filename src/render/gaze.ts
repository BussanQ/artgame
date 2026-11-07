import type {Fighter} from "../engine/types";
import {REST_POSE,type AttackPose} from "./melee";
import {project} from "./projection";

export function gazePose():AttackPose{
  return {...REST_POSE,forward:-3,lift:5,scaleX:1.05,scaleY:1.05};
}
/** A mark above the victim, rather than a live beam that would imply a channel. */
export function drawGazes(c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reducedMotion:boolean){
  c.save();
  for(const f of fighters){
    if(!f.gazed||f.hp<=0||f.gazed.until<=time||f.stunUntil<=time)continue;
    const p=project(f.x+0.5,f.y+0.5),depth=0.78+f.y*0.035;
    const sway=reducedMotion?0:Math.sin(time*2.2)*2;
    const y=p.y-65*depth+sway;
    c.globalAlpha=0.9;c.fillStyle="#1b1338";c.strokeStyle="#b7f09c";c.lineWidth=2;
    c.beginPath();c.moveTo(p.x-14*depth,y);c.quadraticCurveTo(p.x,y-13*depth,p.x+14*depth,y);
    c.quadraticCurveTo(p.x,y+13*depth,p.x-14*depth,y);c.fill();c.stroke();
    c.fillStyle="#e2ffab";c.beginPath();c.ellipse(p.x,y,3*depth,6*depth,0,0,Math.PI*2);c.fill();
    c.strokeStyle="#bb8dea";c.globalAlpha=0.65;c.setLineDash([4,3]);
    for(let i=0;i<2;i++){c.beginPath();c.ellipse(p.x,p.y-(10+i*12)*depth,(23-i*3)*depth,7*depth,i?0.15:-0.15,0,Math.PI*2);c.stroke();}
    c.setLineDash([]);
  }
  c.restore();
}
export function gazeLabels(f:Pick<Fighter,"gaze"|"gazed"|"skillReadyAt"|"stunUntil">,time:number){
  const labels:string[]=[];
  if(f.gazed&&f.gazed.until>time&&f.stunUntil>time)
    labels.push(`凝视压制 ${((f.gazed.until-time)/4).toFixed(1)}s · 每秒削能${f.gazed.drain}`);
  if(f.gaze){labels.push(`凝视控制 ${f.gaze.controls}人次 · 实际削能 ${Math.round(f.gaze.manaDrained)}`);
    if((f.skillReadyAt??0)>time)labels.push(`凝视冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);}
  return labels;
}
