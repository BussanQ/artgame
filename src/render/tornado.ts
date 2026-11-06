import { TORNADO } from "../data/skills";
import type { Fighter } from "../engine/types";
import { REST_POSE, type AttackPose } from "./melee";
import { project } from "./projection";

type Point={x:number;y:number};
function capsule(c:CanvasRenderingContext2D,from:Point,dx:number,dy:number,length:number) {
  const angle=Math.atan2(dy,dx),r=TORNADO.width/2;
  c.beginPath();
  for(let end=0;end<2;end++)for(let i=0;i<=20;i++){
    const a=angle-Math.PI/2+end*Math.PI+i/20*Math.PI;
    const p=project(from.x+0.5+(end?0:dx*length)+Math.cos(a)*r,
      from.y+0.5+(end?0:dy*length)+Math.sin(a)*r);
    if(!end&&!i)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);
  }
  c.closePath();
}
function clipBoard(c:CanvasRenderingContext2D){
  c.beginPath();[project(0,0),project(8,0),project(8,8),project(0,8)]
    .forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.clip();
}
export function tornadoPose(f:Pick<Fighter,"air">,time:number):AttackPose {
  const cast=f.air?.cast;if(cast?.kind!=="tornado")return {...REST_POSE};
  const p=Math.max(0,Math.min(1,1-(cast.next-time)/TORNADO.windup));
  return {...REST_POSE,forward:-4-6*p,lift:3+5*p,rotation:-0.04-0.04*p,scaleX:0.98,scaleY:1+0.06*p};
}
/** A fixed aim strip, then a moving head with only its remaining path highlighted. */
export function drawTornadoes(c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reducedMotion:boolean,layer:"area"|"vortex") {
  c.save();if(layer==="area")clipBoard(c);
  for(const f of fighters){
    const state=f.tornado;if(!state)continue;
    const cast=f.air?.cast;
    if(layer==="area" && f.hp>0 && cast?.kind==="tornado"){
      const dx=cast.to.x-cast.from.x,dy=cast.to.y-cast.from.y,length=Math.hypot(dx,dy);
      if(length){
        capsule(c,cast.from,dx/length,dy/length,TORNADO.length);
        c.fillStyle="#a3e8d511";c.strokeStyle="#b5f2e393";c.lineWidth=1.5;c.setLineDash([6,5]);c.fill();c.stroke();c.setLineDash([]);
      }
    }
    for(const v of state.vortices){
      const traveled=Math.min(TORNADO.length,v.traveled+(time-Math.floor(time))*TORNADO.speed),
        point={x:v.from.x+v.dx*traveled,y:v.from.y+v.dy*traveled};
      if(layer==="area"){
        capsule(c,point,v.dx,v.dy,Math.max(0,TORNADO.length-traveled));
        c.fillStyle="#a3e8d50c";c.strokeStyle="#9bd6c74d";c.lineWidth=1;c.fill();c.stroke();continue;
      }
      if(point.x< -0.7 || point.y< -0.7 || point.x>7.7 || point.y>7.7)continue;
      const p=project(point.x+0.5,point.y+0.5),scale=0.78+Math.max(0,point.y)*0.035;
      c.save();c.translate(p.x,p.y);c.scale(scale,scale);
      c.strokeStyle=v.side===0?"#b9fff0":"#ffd3b1";c.lineWidth=1.8;
      c.shadowColor=v.side===0?"#76d7ca":"#e4ad82";c.shadowBlur=reducedMotion?0:9;
      c.fillStyle=v.side===0?"#8cdacb25":"#d9a87c25";
      c.beginPath();c.moveTo(-5,0);c.bezierCurveTo(-9,-35,-28,-58,-34,-88);
      c.ellipse(0,-88,34,9,0,Math.PI,Math.PI*2);c.bezierCurveTo(28,-58,9,-35,5,0);c.closePath();c.fill();
      const rings=reducedMotion?5:10;
      for(let i=0;i<rings;i++){
        const u=i/(rings-1),r=6+28*u,offset=reducedMotion?0:Math.sin(time*2+u*4)*5*u;
        c.globalAlpha=0.45+u*0.4;c.beginPath();
        c.ellipse(offset,-u*88,r,3+6*u,0,0,Math.PI*2);c.stroke();
      }
      if(!reducedMotion)for(let i=0;i<5;i++){
        const a=time*2+i*Math.PI*0.4,u=((time*0.12+i*0.21)%1),r=8+25*u;
        c.fillStyle="#d7e2c8";c.fillRect(Math.cos(a)*r,-u*88+Math.sin(a)*r*0.25,3,2);
      }
      c.restore();
    }
  }
  c.restore();
}
export function tornadoLabels(f:Pick<Fighter,"tornado"|"skillReadyAt">,time:number){
  const state=f.tornado;if(!state)return [];
  const labels=[`龙卷发出 ${state.launched}次 · 接触 ${state.contacts}人次`,
    `龙卷击飞 ${state.knockups}次 · 落地眩晕 ${state.landings}次`];
  if(state.vortices.length)labels.push(`移动龙卷 ${state.vortices.length}道`);
  if((f.skillReadyAt??0)>time)labels.push(`龙卷风冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
  return labels;
}
