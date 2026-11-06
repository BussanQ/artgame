import { WARCRY } from "../data/skills";
import { petrified } from "../engine/warcry";
import { isUndying } from "../engine/immortality";
import { isPhoenixEgg } from "../engine/phoenix";
import type { CombatEffect, Fighter } from "../engine/types";
import { REST_POSE, type AttackPose } from "./melee";
import { project } from "./projection";

type Point={x:number;y:number};
function fan(c: CanvasRenderingContext2D, from: Point, to: Point, radius: number) {
  const angle=Math.atan2(to.y-from.y,to.x-from.x), half=WARCRY.angle*Math.PI/360;
  const center=project(from.x+0.5,from.y+0.5);
  c.beginPath();c.moveTo(center.x,center.y);
  for(let i=0;i<=30;i++){
    const a=angle-half+i/30*half*2, p=project(from.x+0.5+Math.cos(a)*radius,from.y+0.5+Math.sin(a)*radius);
    c.lineTo(p.x,p.y);
  }
  c.closePath();
}
function clipBoard(c: CanvasRenderingContext2D) {
  c.beginPath();[project(0,0),project(8,0),project(8,8),project(0,8)]
    .forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.clip();
}
export function warcryTarget(f: Fighter, time: number) {
  if(f.air?.cast?.kind==="warcry")return f.air.cast.to;
  const roar=f.warcry?.roar;
  return roar && time>=roar.start && time<roar.start+3 ? roar.to : undefined;
}
/** Raise the chest for the breath, then push the mane/head forward on release. */
export function warcryPose(f: Fighter,time: number): AttackPose {
  if(f.air?.cast?.kind==="warcry"){
    const p=Math.max(0,Math.min(1,1-(f.air.cast.next-time)/WARCRY.windup));
    return {...REST_POSE,forward:-4-4*p,lift:3+4*p,rotation:-0.035-0.035*p,scaleX:0.97,scaleY:1+0.07*p};
  }
  if(!warcryTarget(f,time))return {...REST_POSE};
  const p=Math.max(0,1-(time-f.warcry!.roar!.start)/3);
  return {...REST_POSE,forward:8*p,lift:4*p,rotation:0.045*p,scaleX:1+0.05*p,scaleY:1-0.04*p};
}
export function drawWarcryTelegraphs(c: CanvasRenderingContext2D,fighters: Fighter[],time: number,reducedMotion: boolean) {
  c.save();clipBoard(c);
  for(const f of fighters){
    const cast=f.air?.cast;if(f.hp<=0 || cast?.kind!=="warcry")continue;
    fan(c,cast.from,cast.to,WARCRY.radius);
    c.fillStyle="#dfbc6b16";c.strokeStyle=reducedMotion?"#e5cf9b99":`rgba(237,208,143,${0.55+Math.sin(time*3)*0.1})`;
    c.lineWidth=1.5;c.setLineDash([6,5]);c.fill();c.stroke();c.setLineDash([]);
  }
  c.restore();
}
export function drawWarcryEffect(c: CanvasRenderingContext2D,e: CombatEffect,age: number,reducedMotion: boolean) {
  if(e.kind==="cast" && e.name===WARCRY.name)return true;
  if(e.kind==="pulse" && e.name===WARCRY.name){
    if(age<0 || age>3)return true;
    c.save();clipBoard(c);c.globalAlpha=Math.max(0,1-age/3);
    fan(c,e.from,e.to,WARCRY.radius);c.fillStyle="#e0c38d24";c.strokeStyle="#e6d1a0";c.lineWidth=2;c.fill();c.stroke();
    if(!reducedMotion)for(let i=0;i<3;i++){
      const radius=Math.min(WARCRY.radius,(age+i*0.8)*0.85);
      fan(c,e.from,e.to,radius);c.strokeStyle="#fff0c699";c.lineWidth=2.5-i*0.5;c.stroke();
    }
    c.restore();return true;
  }
  if(e.kind!=="reflect" || e.name!=="战吼反伤")return false;
  if(age<0 || age>2)return true;
  const from=project(e.from.x+0.5,e.from.y+0.5),to=project(e.to.x+0.5,e.to.y+0.5);
  c.save();c.globalAlpha=Math.max(0,1-age/2);c.strokeStyle="#ebd29c";c.lineWidth=2;
  c.beginPath();c.moveTo(from.x,from.y-40);
  for(let i=1;i<=6;i++){const p=i/6;c.lineTo(from.x+(to.x-from.x)*p+(reducedMotion?0:Math.sin(i*2.6)*5),from.y-40+(to.y-from.y)*p);}
  c.stroke();c.restore();return true;
}
/** Unit-local stone edges and armor-like mane rays; neither is a shield bubble. */
export function drawWarcryStatus(c: CanvasRenderingContext2D,f: Fighter,time: number,scale: number) {
  c.save();
  if(petrified(f,time)){
    c.strokeStyle="#c1c4ac";c.lineWidth=2;c.fillStyle="#89958d70";
    for(let i=0;i<5;i++){
      const x=(i-2)*14*scale, y=-8*scale-(i%2)*9*scale;
      c.beginPath();c.moveTo(x-5*scale,y);c.lineTo(x-2*scale,y-15*scale);c.lineTo(x+5*scale,y-8*scale);c.closePath();c.fill();c.stroke();
    }
  }
  if(f.hp>0 && f.warcry && f.warcry.until>time && !isUndying(f) && !isPhoenixEgg(f)){
    c.strokeStyle="#e5bf7c99";c.lineWidth=2;
    for(const sign of [-1,1])for(let i=0;i<3;i++){
      c.beginPath();c.moveTo(sign*(25+i*4)*scale,(-48+i*12)*scale);
      c.lineTo(sign*(37+i*4)*scale,(-56+i*12)*scale);c.stroke();
    }
  }
  c.restore();
}
export function warcryLabels(f: Fighter,time: number) {
  const state=f.warcry;if(!state)return [];
  const labels=[`战吼释放 ${state.roars}次 · 石化 ${state.petrified}人次`,
    `战吼反伤触发 ${state.retaliations}次 · 生命伤害 ${state.retaliationDamage} · 破盾 ${state.retaliationShield}`];
  if(f.hp>0 && state.until>time && !isUndying(f) && !isPhoenixEgg(f))
    labels.push(`战吼反伤 ${state.reflection}真实伤害 · ${((state.until-time)/4).toFixed(1)}s`);
  if((f.skillReadyAt??0)>time)labels.push(`战吼冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
  return labels;
}
