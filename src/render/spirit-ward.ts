import type {Fighter} from "../engine/types";
import {spiritWardBuff} from "../engine/spirit-ward";
import {REST_POSE,type AttackPose} from "./melee";
import {project} from "./projection";

export function spiritWardPose(f:Pick<Fighter,"spiritWard">,time:number):AttackPose{
  const cast=f.spiritWard?.channel;if(!cast)return {...REST_POSE};
  const charge=Math.min(1,Math.max(0,(time-cast.start)/(cast.release-cast.start)));
  return {...REST_POSE,lift:3+charge*2,rotation:-0.035,scaleX:0.96,scaleY:1.04};
}
export function drawSpiritWards(c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reducedMotion:boolean){
  c.save();
  for(const source of fighters){
    const cast=source.spiritWard?.channel;if(!cast||source.hp<=0||cast.until<=time)continue;
    const a=project(source.x+0.5,source.y+0.65);a.y-=60;
    c.strokeStyle="#b4edb0";c.fillStyle="#caedac";c.lineWidth=2;
    c.beginPath();c.arc(a.x,a.y-28,9,0,Math.PI*2);c.stroke();
    if(!cast.formed)continue;
    for(const uid of cast.targets){
      const target=fighters.find(f=>f.uid===uid);if(!target||target.hp<=0)continue;
      const best=spiritWardBuff(target,time,fighters);if(!best)continue;
      const active=best.source===source.uid,b=project(target.x+0.5,target.y+0.65);b.y-=36;
      c.globalAlpha=active?0.8:0.3;c.lineWidth=active?2.4:1;c.setLineDash(active?[]:[5,5]);
      const bend=Math.min(a.y,b.y)-24;
      c.beginPath();c.moveTo(a.x,a.y);c.bezierCurveTo(a.x,bend,b.x,bend,b.x,b.y);c.stroke();c.setLineDash([]);
      if(active){
        c.beginPath();c.ellipse(b.x,b.y,24,32,0,0,Math.PI*2);c.stroke();
        if(!reducedMotion){
          const t=((time-cast.release)*0.15+uid*0.13)%1,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t-20*Math.sin(Math.PI*t);
          c.beginPath();c.arc(x,y,3,0,Math.PI*2);c.fill();
        }
      }
    }
  }
  c.restore();
}
export function spiritWardLabels(f:Fighter,time:number){
  const labels:string[]=[],state=f.spiritWard,cast=state?.channel,ward=spiritWardBuff(f,time);
  if(state){
    labels.push(`庇护 ${state.formed}次 · 保护 ${state.protected}人次`,`防护减伤 ${state.mitigated} · 物理 ${state.physicalSaved} / 法术 ${state.magicSaved}`);
    if(cast)labels.push(cast.formed?`维持庇护 ${((cast.until-time)/4).toFixed(1)}s · ${cast.targets.length}条连线`:`庇护蓄灵 ${Math.max(0,(cast.release-time)/4).toFixed(2)}s`);
    if(state.severed)labels.push(`连线断开 ${state.severed}条`);
    if(state.interrupted)labels.push(`庇护中断 ${state.interrupted}次`);
    if((f.skillReadyAt??0)>time)labels.push(`庇护冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
  }
  if(ward)labels.push(`庇护护甲 +${ward.armor} · 法术减伤 +${Math.round(ward.resist*100)}% · ${((ward.until-time)/4).toFixed(1)}s`);
  return labels;
}
