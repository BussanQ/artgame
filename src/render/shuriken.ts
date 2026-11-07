import { SHURIKEN } from "../data/skills";
import type { Fighter } from "../engine/types";
import { project } from "./projection";

type Blade = NonNullable<Fighter["shuriken"]>["blades"][number];
export function shurikenPosition(blade: Blade, time: number) {
  const t = Math.max(0,Math.min(1,(time-blade.start)/(blade.until-blade.start)));
  return { x:blade.from.x+(blade.to.x-blade.from.x)*t,
    y:blade.from.y+(blade.to.y-blade.from.y)*t, progress:t };
}
function circle(c:CanvasRenderingContext2D,x:number,y:number,radius:number) {
  c.beginPath();
  for(let i=0;i<=64;i++) {
    const a=i*Math.PI/32,p=project(x+0.5+Math.cos(a)*radius,y+0.5+Math.sin(a)*radius);
    if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);
  }
  c.closePath();
}
function blade(c:CanvasRenderingContext2D,x:number,y:number,size:number,angle:number) {
  c.save();c.translate(x,y);c.rotate(angle);
  c.fillStyle="#b2d9d8";c.strokeStyle="#e8fff4";c.lineWidth=1.6;
  c.shadowColor="#79e9d8";c.shadowBlur=9;
  c.beginPath();
  for(let i=0;i<12;i++) {
    const a=i*Math.PI/6,r=i%3===0?size:i%3===1?size*0.24:size*0.42;
    if(i)c.lineTo(Math.cos(a)*r,Math.sin(a)*r);else c.moveTo(Math.cos(a)*r,Math.sin(a)*r);
  }
  c.closePath();c.fill();c.stroke();
  c.shadowBlur=0;c.fillStyle="#152f32";c.beginPath();c.arc(0,0,size*0.12,0,Math.PI*2);c.fill();
  c.restore();
}
/** Exact ground-circle boundary, while the rotating weapon is presentation only. */
export function drawShuriken(
  c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reducedMotion:boolean,
  layer:"area"|"blades",
) {
  c.save();
  if(layer==="area") {
    c.beginPath();[project(0,0),project(8,0),project(8,8),project(0,8)]
      .forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));
    c.closePath();c.clip();
  }
  for(const source of fighters) {
    const state=source.shuriken;if(!state)continue;
    if(layer==="area") {
      const mark=state.casting ?? state.blades.at(-1);
      if(mark) {
        circle(c,mark.to.x,mark.to.y,mark.radius);
        c.fillStyle=mark.side===0?"#75e9c816":"#ff97701a";
        c.strokeStyle=mark.side===0?"#8de6cfaa":"#ff9b78aa";
        c.lineWidth=1.5;c.setLineDash([5,5]);c.fill();c.stroke();c.setLineDash([]);
      }
      for(const field of state.fields) {
        if(time>field.until)continue;
        const alpha=Math.min(1,(field.until-time)/1.2);
        c.save();c.globalAlpha=Math.max(0.15,alpha);
        circle(c,field.x,field.y,field.radius);
        c.fillStyle=field.side===0?"#71dfcb30":"#ee9b6733";
        c.strokeStyle=field.side===0?"#acf5dbcc":"#ffc29bcc";c.lineWidth=2;c.fill();c.stroke();
        if(!reducedMotion) {
          const phase=(time-field.start)%SHURIKEN.pulseInterval/SHURIKEN.pulseInterval;
          circle(c,field.x,field.y,field.radius*(0.25+0.75*phase));
          c.globalAlpha*=0.45*(1-phase);c.lineWidth=1;c.stroke();
        }
        c.restore();
      }
      continue;
    }
    for(const flying of state.blades) {
      const at=shurikenPosition(flying,time),p=project(at.x+0.5,at.y+0.5);
      blade(c,p.x,p.y-32-Math.sin(at.progress*Math.PI)*16,22,reducedMotion?0:time*2);
    }
    for(const field of state.fields) {
      if(time>field.until)continue;
      const p=project(field.x+0.5,field.y+0.5);
      c.save();c.globalAlpha=Math.max(0,Math.min(1,(field.until-time)/1.2));
      c.translate(p.x,p.y-7);c.scale(1,0.55);
      blade(c,0,0,38+field.radius*5,reducedMotion?0:time*1.4);c.restore();
    }
  }
  c.restore();
}
export function shurikenLabels(f:Pick<Fighter,"shuriken"|"skillReadyAt">,time:number) {
  const state=f.shuriken;if(!state)return [];
  const labels=[`飞镖发出 ${state.launched}枚 · 落地 ${state.landings}次`,
    `刃阵脉冲 ${state.pulses}次 · 有效波及 ${state.hits}人次`];
  if(state.casting)labels.push(`飞镖蓄力 ${Math.max(0,(state.casting.until-time)/4).toFixed(2)}s`);
  for(const field of state.fields.filter(field=>field.until>=time))
    labels.push(`刃阵半径 ${field.radius}格 · 余${field.remaining}跳 · ${Math.max(0,(field.until-time)/4).toFixed(1)}s`);
  if(state.interrupted)labels.push(`飞镖蓄力中断 ${state.interrupted}次`);
  if((f.skillReadyAt??0)>time)labels.push(`风魔冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
  return labels;
}
