import { WILDFIRE } from "../data/skills";
import { phoenixFlameCells } from "../engine/phoenix";
import type { Fighter } from "../engine/types";
import { REST_POSE, type AttackPose } from "./melee";
import { project } from "./projection";

export function wildfirePalette(star: number) {
  return star >= 3 ? {edge:"#ffe28c",fire:"#ffcc43",core:"#fff8c9"} :
    star === 2 ? {edge:"#ffaf73",fire:"#ff7043",core:"#ffe9bb"} :
    {edge:"#91e8ff",fire:"#4bbaff",core:"#d6faff"};
}
export function wildfirePose(f: Pick<Fighter,"wildfire">,time:number):AttackPose {
  const state=f.wildfire,cast=state?.casting;
  if(cast){
    const p=Math.max(0,Math.min(1,(time-cast.start)/WILDFIRE.windup));
    return {...REST_POSE,forward:-4-5*p,lift:3+4*p,rotation:-0.05*p,scaleX:1+0.06*p,scaleY:1+0.03*p};
  }
  if(state?.channel)return {...REST_POSE,forward:4,lift:5+Math.sin(time*2)*1.5,
    rotation:0.035,scaleX:1.06,scaleY:0.97};
  return {...REST_POSE};
}
/** The same clipped cells used by damage, plus a star-colored breath from the fixed caster. */
export function drawWildfires(c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reducedMotion:boolean,layer:"area"|"breath") {
  c.save();
  for(const f of fighters){
    const state=f.wildfire,flame=state?.channel,shape=flame??state?.casting;
    if(!shape||f.hp<=0)continue;
    const palette=wildfirePalette(f.star),cells=phoenixFlameCells(shape.from,shape.to);
    if(layer==="area"){
      for(const cell of cells){
        c.beginPath();[project(cell.x,cell.y),project(cell.x+1,cell.y),project(cell.x+1,cell.y+1),project(cell.x,cell.y+1)]
          .forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();
        c.fillStyle=palette.fire+(flame?"20":"0b");c.strokeStyle=palette.edge+(flame?"72":"60");
        c.lineWidth=1;c.setLineDash(flame?[]:[5,4]);c.fill();c.stroke();c.setLineDash([]);
        if(!flame)continue;
        const p=project(cell.x+0.5,cell.y+0.5),t=reducedMotion?0:time;
        const h=16+Math.sin(t*3+cell.x*1.3+cell.y)*7;
        c.fillStyle=palette.fire+"85";c.beginPath();c.moveTo(p.x-8,p.y);
        c.bezierCurveTo(p.x-12,p.y-h*0.5,p.x+4,p.y-h*0.8,p.x+2,p.y-h);
        c.bezierCurveTo(p.x+15,p.y-h*0.35,p.x+9,p.y-2,p.x+8,p.y);c.closePath();c.fill();
        c.fillStyle=palette.core+"ae";c.beginPath();c.moveTo(p.x-3,p.y);
        c.quadraticCurveTo(p.x-5,p.y-h*0.3,p.x+3,p.y-h*0.6);
        c.quadraticCurveTo(p.x+7,p.y-h*0.2,p.x+3,p.y);c.fill();
      }
    } else {
      const a=project(shape.from.x+0.5,shape.from.y+0.5);a.y-=62;
      const near=cells.filter(cell=>Math.abs(cell.x-shape.from.x)+Math.abs(cell.y-shape.from.y)===1)[0];
      if(!near)continue;
      const b=project(near.x+0.5,near.y+0.5);b.y-=8;
      if(!flame){
        const p=Math.max(0,Math.min(1,(time-shape.start)/WILDFIRE.windup));
        c.strokeStyle=palette.edge;c.lineWidth=2;c.beginPath();c.arc(a.x,a.y,5+8*p,0,Math.PI*2);c.stroke();continue;
      }
      c.strokeStyle=palette.fire+"b0";c.lineWidth=12;c.lineCap="round";
      c.beginPath();c.moveTo(a.x,a.y);c.quadraticCurveTo(a.x+(b.x-a.x)*0.55,a.y+(b.y-a.y)*0.15,b.x,b.y);c.stroke();
      c.strokeStyle=palette.core+"c0";c.lineWidth=3;c.stroke();
      if(!reducedMotion){
        c.fillStyle=palette.core;
        for(let i=0;i<6;i++){
          const t=(time*0.27+i/6)%1;
          c.globalAlpha=1-t;c.fillRect(a.x+(b.x-a.x)*t+Math.sin(i+time)*3,a.y+(b.y-a.y)*t-8*Math.sin(t*Math.PI),2,3);
        }
        c.globalAlpha=1;
      }
    }
  }
  c.restore();
}
export function wildfireLabels(f: Pick<Fighter,"wildfire"|"skillReadyAt">,time:number) {
  const state=f.wildfire;if(!state)return [];
  const labels=[`燎原形成 ${state.formed}次 · 脉冲 ${state.pulses}次 · 命中 ${state.hits}人次`,
    `涅槃火种 ${state.eggs}次 · 重生 ${state.hatches}次 · 火种破碎 ${state.brokenEggs}次`];
  if(state.casting)labels.push("燎原蓄焰中");
  if(state.channel)labels.push(`持续喷火 · 剩余 ${Math.max(0,(state.channel.until-time)/4).toFixed(1)}s`);
  if(state.interrupted)labels.push(`燎原中断 ${state.interrupted}次`);
  if((f.skillReadyAt??0)>time)labels.push(`燎原冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
  return labels;
}
