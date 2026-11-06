import {THORNBIND} from "../data/skills";
import type {Fighter} from "../engine/types";
import {REST_POSE,type AttackPose} from "./melee";
import {project} from "./projection";

export function thornBindPose(f:Pick<Fighter,"thornbind">,time:number):AttackPose{
  const cast=f.thornbind?.channel;if(!cast)return {...REST_POSE};
  const windup=Math.max(0,Math.min(1,(time-cast.start)/THORNBIND.windup));
  return {...REST_POSE,forward:4+windup*5,lift:2,rotation:0.035,scaleX:1.04,scaleY:0.97};
}
/** Live links visibly relax in the action gap; root coils follow actual dispellable control. */
export function drawThornBinds(c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reducedMotion:boolean){
  c.save();c.lineCap="round";
  for(const f of fighters){
    const cast=f.thornbind?.channel;if(!cast||f.hp<=0)continue;
    const target=fighters.find(t=>t.uid===cast.target);if(!target||target.hp<=0)continue;
    const a=project(f.x+0.5,f.y+0.5),b=project(target.x+0.5,target.y+0.5);a.y-=25;b.y-=22;
    const tight=target.thornRoot?.source===f.uid&&target.thornRoot.until>time&&target.stunUntil>time;
    const wobble=reducedMotion?0:Math.sin(time*3)*3;
    for(const side of [-1,1]){
      const bend=(tight?9:20)*side+wobble;
      c.strokeStyle=tight?"#94ba67":"#638c6966";c.lineWidth=tight?3.5:2;
      c.setLineDash(tight?[]:[5,4]);c.beginPath();c.moveTo(a.x,a.y);
      c.bezierCurveTo(a.x+(b.x-a.x)*0.3+bend,a.y-18,b.x-(b.x-a.x)*0.2-bend,b.y+12,b.x,b.y);c.stroke();
    }
    c.setLineDash([]);
    if(tight&&!reducedMotion){
      c.fillStyle="#c4f0a0";
      for(let i=0;i<3;i++){
        const t=(time*0.3+i/3)%1;c.beginPath();c.arc(b.x+(a.x-b.x)*t,b.y+(a.y-b.y)*t-10*Math.sin(t*Math.PI),2.5,0,Math.PI*2);c.fill();
      }
    }
  }
  for(const f of fighters){
    if(!f.thornRoot||f.hp<=0||f.thornRoot.until<=time||f.stunUntil<=time)continue;
    const p=project(f.x+0.5,f.y+0.5),depth=0.78+f.y*0.035;
    c.strokeStyle="#719c53";c.lineWidth=3;c.setLineDash([]);
    for(let i=0;i<3;i++){
      c.beginPath();c.ellipse(p.x,p.y-(8+i*11)*depth,(20-i*3)*depth,6*depth,-0.15,0,Math.PI*2);c.stroke();
    }
    c.fillStyle="#b2d58b";
    for(const side of [-1,1]){c.beginPath();c.moveTo(p.x+side*15,p.y-20);c.lineTo(p.x+side*24,p.y-28);c.lineTo(p.x+side*18,p.y-11);c.fill();}
  }
  c.restore();
}
export function thornBindLabels(f:Pick<Fighter,"thornbind"|"thornRoot"|"skillReadyAt"|"stunUntil">,time:number){
  const labels:string[]=[],state=f.thornbind;
  if(f.thornRoot&&f.thornRoot.until>time&&f.stunUntil>time)labels.push(`藤蔓束缚 ${((f.thornRoot.until-time)/4).toFixed(2)}s`);
  if(!state)return labels;
  labels.push(`缠绕 ${state.pulses}段 · 有效命中 ${state.hits}次 · 汲取治疗 ${state.healing}`);
  if(state.channel)labels.push(`维持藤蔓 · 余${state.channel.remaining}段 · 下段${Math.max(0,(state.channel.next-time)/4).toFixed(2)}s`);
  if(state.retargets)labels.push(`藤蔓转火 ${state.retargets}次`);
  if(state.interrupted)labels.push(`藤蔓中断 ${state.interrupted}次`);
  if((f.skillReadyAt??0)>time)labels.push(`缠绕冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
  return labels;
}
