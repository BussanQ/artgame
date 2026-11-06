import type {Fighter} from "../engine/types";
import {bulwarkActive} from "../engine/bulwark";
import {REST_POSE,type AttackPose} from "./melee";
import {project} from "./projection";

export function bulwarkPose(f:Pick<Fighter,"hp"|"bulwark">,time:number):AttackPose{
  if(!bulwarkActive(f,time))return {...REST_POSE};
  return {...REST_POSE,lift:-2,scaleX:1.05,scaleY:0.94,rotation:-0.025};
}
export function drawBulwarks(c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reducedMotion:boolean){
  c.save();
  for(const source of fighters.filter(f=>bulwarkActive(f,time))){
    const p=project(source.x+0.5,source.y+0.65),state=source.bulwark!;
    const pulse=reducedMotion?1:0.85+Math.sin((time-state.start)*0.8)*0.15;
    c.strokeStyle="#a3d7df";c.fillStyle="#427d8c24";c.lineWidth=2;c.globalAlpha=pulse;
    c.beginPath();c.ellipse(p.x,p.y,38,13,0,0,Math.PI*2);c.fill();c.stroke();
    // A stable shield crest above the body makes the stance readable without covering its weapon.
    c.beginPath();c.moveTo(p.x-12,p.y-96);c.lineTo(p.x+12,p.y-96);c.lineTo(p.x+11,p.y-80);
    c.lineTo(p.x,p.y-71);c.lineTo(p.x-11,p.y-80);c.closePath();c.fillStyle="#123d46d9";c.fill();c.stroke();
    c.beginPath();c.moveTo(p.x,p.y-92);c.lineTo(p.x,p.y-78);c.moveTo(p.x-6,p.y-86);c.lineTo(p.x+6,p.y-86);c.stroke();
    for(const victim of fighters.filter(f=>f.hp>0&&f.taunt?.kind==="bulwark"&&f.taunt.source===source.uid&&f.taunt.until>time)){
      const t=project(victim.x+0.5,victim.y+0.65),dx=p.x-t.x,dy=p.y-t.y,len=Math.max(1,Math.hypot(dx,dy));
      const x=p.x-dx/len*40,y=p.y-dy/len*14;
      c.strokeStyle="#f0ba7b";c.globalAlpha=0.9;c.setLineDash([4,4]);
      c.beginPath();c.moveTo(t.x,t.y-3);c.lineTo(x,y-3);c.stroke();c.setLineDash([]);
      const a=Math.atan2(dy,dx);c.beginPath();c.moveTo(x-Math.cos(a-0.5)*8,y-3-Math.sin(a-0.5)*8);
      c.lineTo(x,y-3);c.lineTo(x-Math.cos(a+0.5)*8,y-3-Math.sin(a+0.5)*8);c.stroke();
    }
  }
  c.restore();
}
export function bulwarkLabels(f:Pick<Fighter,"hp"|"bulwark"|"skillReadyAt">,time:number){
  const state=f.bulwark;if(!state)return [];
  const labels=[`盾阵 ${state.formations}次 · 嘲讽 ${state.taunts}人次`];
  if(bulwarkActive(f,time))labels.push(`盾阵护甲 +${state.armor} · ${((state.until-time)/4).toFixed(1)}s`);
  if((f.skillReadyAt??0)>time)labels.push(`盾阵冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
  return labels;
}
