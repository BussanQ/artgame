import { SECRET_ORB } from "../data/skills";
import type { Fighter } from "../engine/types";
import { REST_POSE, type AttackPose } from "./melee";
import { project } from "./projection";

function circle(c:CanvasRenderingContext2D,x:number,y:number,radius:number) {
  c.beginPath();
  for(let i=0;i<=64;i++) {
    const angle=i*Math.PI/32,p=project(x+0.5+Math.cos(angle)*radius,y+0.5+Math.sin(angle)*radius);
    if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);
  }
  c.closePath();
}
export function secretOrbPose(f:Pick<Fighter,"secretOrb">,time:number):AttackPose {
  const cast=f.secretOrb?.casting;
  if(cast){const t=Math.max(0,Math.min(1,(time-cast.start)/SECRET_ORB.windup));
    return {...REST_POSE,forward:-7*t,lift:4*t,rotation:-0.045*t,scaleX:1-0.04*t};}
  if(f.secretOrb?.channel)return {...REST_POSE,forward:8,lift:2+Math.sin(time*1.3)*0.7,rotation:0.035,scaleX:0.97};
  return {...REST_POSE};
}
/** Fixed circular game-space boundary; the beam makes the maintained caster link visible. */
export function drawSecretOrbs(
  c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reducedMotion:boolean,
  layer:"area"|"orb",
) {
  c.save();
  if(layer==="area") {
    c.beginPath();[project(0,0),project(8,0),project(8,8),project(0,8)]
      .forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.clip();
  }
  for(const source of fighters) {
    const state=source.secretOrb;if(!state||source.hp<=0)continue;
    const cast=state.casting,orb=state.channel;
    if(!cast&&!orb)continue;
    const point=cast?.to??orb!,radius=cast?.radius??orb!.radius;
    const side=cast?.side??orb!.side;
    if(layer==="area") {
      circle(c,point.x,point.y,radius);c.lineWidth=cast?1.3:2;
      c.fillStyle=side===0?(cast?"#77ebf018":"#63d9e52d"):(cast?"#ffac8620":"#efa46b30");
      c.strokeStyle=side===0?"#9cecf1b8":"#ffbe96c8";if(cast)c.setLineDash([6,5]);
      c.fill();c.stroke();c.setLineDash([]);continue;
    }
    const p=project(point.x+0.5,point.y+0.5),from=project(source.x+0.5,source.y+0.5);
    const progress=cast?Math.max(0,Math.min(1,(time-cast.start)/SECRET_ORB.windup)):1;
    const pulse=reducedMotion?0:Math.sin((time-(orb?.start??cast!.start))*Math.PI/2);
    const size=(18+radius*10)*progress+2*pulse;
    c.save();
    c.strokeStyle="#89e8ef8a";c.lineWidth=3;c.shadowColor="#70e2ec";c.shadowBlur=reducedMotion?0:10;
    c.beginPath();c.moveTo(from.x,from.y-55);c.quadraticCurveTo((from.x+p.x)/2,(from.y+p.y)/2-65,p.x,p.y-45);c.stroke();
    c.translate(p.x,p.y-45);
    const glow=c.createRadialGradient(-size*0.2,-size*0.25,2,0,0,Math.max(3,size));
    glow.addColorStop(0,"#edfff3ed");glow.addColorStop(0.28,"#8ef6e8d9");
    glow.addColorStop(0.7,"#43a9c39c");glow.addColorStop(1,"#32438412");
    c.fillStyle=glow;c.beginPath();c.arc(0,0,Math.max(2,size),0,Math.PI*2);c.fill();
    for(let i=0;i<2;i++) {
      c.strokeStyle=i?"#e4cd91b8":"#a5f8f0cc";c.lineWidth=1.6;
      c.beginPath();c.ellipse(0,0,size*0.92,size*0.35,(reducedMotion?0:time*0.3)+(i?1.1:-0.7),0,Math.PI*2);c.stroke();
    }
    c.restore();
  }
  c.restore();
}
export function secretOrbLabels(f:Pick<Fighter,"secretOrb"|"skillReadyAt">,time:number) {
  const state=f.secretOrb;if(!state)return [];
  const labels=[`秘法球形成 ${state.formed}次 · 脉冲 ${state.pulses}次`,
    `有效波及 ${state.hits}人次 · 实际削能 ${Math.round(state.energyRemoved)}`];
  if(state.casting)labels.push(`秘法球蓄力 ${Math.max(0,(state.casting.until-time)/4).toFixed(2)}s`);
  if(state.channel)labels.push(`维持半径 ${state.channel.radius}格 · 余${SECRET_ORB.pulses-state.channel.nextIndex}跳 · ${Math.max(0,(state.channel.until-time)/4).toFixed(1)}s`);
  if(state.interrupted)labels.push(`秘法球中断 ${state.interrupted}次`);
  if((f.skillReadyAt??0)>time)labels.push(`秘法球冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
  return labels;
}
