import { BONEBLAST } from "../data/skills";
import type { CombatEffect, Fighter } from "../engine/types";
import { REST_POSE, type AttackPose } from "./melee";
import { project } from "./projection";

type Point={x:number;y:number};
function circle(c:CanvasRenderingContext2D,center:Point,radius:number) {
  c.beginPath();
  for(let i=0;i<=48;i++){
    const a=i/48*Math.PI*2,p=project(center.x+0.5+Math.cos(a)*radius,center.y+0.5+Math.sin(a)*radius);
    if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);
  }
  c.closePath();
}
function orb(c:CanvasRenderingContext2D,p:Point,r:number,rotation:number,reducedMotion:boolean) {
  c.save();c.translate(p.x,p.y);c.rotate(rotation);
  const glow=c.createRadialGradient(-r*0.25,-r*0.3,1,0,0,r);
  glow.addColorStop(0,"#e0fff1");glow.addColorStop(0.25,"#7cdcc4");glow.addColorStop(0.8,"#17453d");glow.addColorStop(1,"#071b18");
  c.fillStyle=glow;c.shadowColor="#8bf1d6";c.shadowBlur=reducedMotion?0:12;
  c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.shadowBlur=0;
  c.strokeStyle="#d5e7cc";c.lineWidth=3;
  for(let i=0;i<3;i++){
    c.save();c.rotate(i*Math.PI/3);c.beginPath();c.ellipse(0,0,r*0.42,r*0.99,0,0,Math.PI*2);c.stroke();c.restore();
  }
  c.strokeStyle="#a6c8b5";c.lineWidth=2;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.stroke();
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,x=Math.cos(a),y=Math.sin(a);
    c.beginPath();c.moveTo(x*r*0.85,y*r*0.85);c.lineTo(x*r*1.18,y*r*1.18);c.stroke();
  }
  c.restore();
}
export function boneBlastPose(f:Pick<Fighter,"air">,time:number):AttackPose {
  const cast=f.air?.cast;if(cast?.kind!=="boneblast")return {...REST_POSE};
  const p=Math.max(0,Math.min(1,1-(cast.next-time)/BONEBLAST.windup));
  return {...REST_POSE,forward:-4-9*p,lift:2+6*p,rotation:-0.07*p,scaleX:1-0.04*p,scaleY:1+0.07*p};
}
/** Fixed aim circles under fighters, charging and flying bony spheres above them. */
export function drawBoneBlasts(c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reducedMotion:boolean,layer:"area"|"orb") {
  c.save();
  if(layer==="area"){
    c.beginPath();[project(0,0),project(8,0),project(8,8),project(0,8)]
      .forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.clip();
  }
  for(const f of fighters){
    const state=f.boneblast;if(!state)continue;
    const cast=f.air?.cast?.kind==="boneblast"?f.air.cast:undefined;
    if(layer==="area"){
      for(const shape of [...(cast?[cast]:[]),...state.orbs]){
        circle(c,shape.to,BONEBLAST.radius);c.fillStyle="#a0e2ce0c";c.strokeStyle="#b9ebd575";
        c.lineWidth=1.4;c.setLineDash([5,4]);c.fill();c.stroke();c.setLineDash([]);
      }
      continue;
    }
    if(cast&&f.hp>0){
      const progress=Math.max(0,Math.min(1,1-(cast.next-time)/BONEBLAST.windup));
      const p=project(cast.from.x+0.5,cast.from.y+0.5);p.y-=62;
      orb(c,p,5+progress*17,reducedMotion?0:time*0.3,reducedMotion);
    }
    for(const bone of state.orbs){
      const u=Math.max(0,Math.min(1,(time-bone.start)/(bone.landAt-bone.start)));
      const x=bone.from.x+(bone.to.x-bone.from.x)*u,y=bone.from.y+(bone.to.y-bone.from.y)*u;
      const p=project(x+0.5,y+0.5);p.y-=62*(1-u)+8*u+Math.sin(u*Math.PI)*40;
      if(!reducedMotion){
        const tail=project(x+0.5-(bone.to.x-bone.from.x)*0.12,y+0.5-(bone.to.y-bone.from.y)*0.12);
        tail.y-=62*(1-u)+8*u+Math.sin(u*Math.PI)*40;
        c.strokeStyle="#9ee9ce55";c.lineWidth=6;c.beginPath();c.moveTo(tail.x,tail.y);c.lineTo(p.x,p.y);c.stroke();
      }
      orb(c,p,(16+f.star*3)*(0.78+y*0.035),reducedMotion?0:time*0.4,reducedMotion);
    }
  }
  c.restore();
}
export function drawBoneBlastEffect(c:CanvasRenderingContext2D,e:CombatEffect,age:number,reducedMotion:boolean) {
  if(e.kind!=="pulse"||e.name!==BONEBLAST.name)return false;
  if(age<0||age>4)return true;
  c.save();c.globalAlpha=Math.max(0,1-age/4);
  circle(c,e.to,BONEBLAST.radius);c.fillStyle="#8fe0bf28";c.strokeStyle="#d7f3d6";c.lineWidth=2;c.fill();c.stroke();
  const p=project(e.to.x+0.5,e.to.y+0.5);p.y-=15;
  if(reducedMotion)orb(c,p,22,0,true);
  else for(let i=0;i<10;i++){
    const a=i*Math.PI/5,spread=12+age*16,x=p.x+Math.cos(a)*spread,y=p.y+Math.sin(a)*spread*0.55-age*8;
    c.save();c.translate(x,y);c.rotate(a+age*0.8);c.fillStyle=i%2?"#c7e4ce":"#a3dbc4";c.fillRect(-3,-8,6,16);c.restore();
  }
  c.restore();return true;
}
export function boneBlastLabels(f:Pick<Fighter,"boneblast"|"skillReadyAt">,time:number){
  const state=f.boneblast;if(!state)return [];
  const labels=[`骨球发出 ${state.launched}枚 · 落地 ${state.detonated}枚`,
    `骨爆命中 ${state.hits}人次 · 眩晕 ${state.stuns}次`];
  if(state.orbs.length)labels.push(`飞行骨球 ${state.orbs.length}枚`);
  if(state.interrupted)labels.push(`骨爆蓄力中断 ${state.interrupted}次`);
  if((f.skillReadyAt??0)>time)labels.push(`骨爆冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
  return labels;
}
