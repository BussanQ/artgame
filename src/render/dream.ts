import type {Fighter} from "../engine/types";
import {project} from "./projection";

export function drawDreams(c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reduced:boolean){
  c.save();
  for(const target of fighters){
    const mark=target.charm;
    if(mark?.source===undefined||mark.until<=time||target.hp<=0)continue;
    const source=fighters.find(f=>f.uid===mark.source&&f.hp>0);
    if(!source)continue;
    const a=project(source.x+0.5,source.y+0.5),b=project(target.x+0.5,target.y+0.5);
    c.strokeStyle="#d2a7ee";c.lineWidth=1.4;c.globalAlpha=0.55;
    c.setLineDash(reduced?[]:[5,5]);c.lineDashOffset=reduced?0:-time*1.5;
    c.beginPath();c.moveTo(a.x,a.y-35);c.quadraticCurveTo((a.x+b.x)/2,(a.y+b.y)/2-75,b.x,b.y-35);c.stroke();
    c.setLineDash([]);c.globalAlpha=0.8;c.lineWidth=2;
    c.beginPath();c.ellipse(b.x,b.y,29,9,0,0,Math.PI*2);c.stroke();
    for(let i=0;i<4;i++){
      const angle=i*Math.PI/2+(reduced?0:time*0.1);
      c.beginPath();c.moveTo(b.x+Math.cos(angle)*19,b.y-36+Math.sin(angle)*10);c.lineTo(b.x+Math.cos(angle)*27,b.y-36+Math.sin(angle)*17);c.stroke();
    }
  }
  c.restore();
}

export function dreamLabels(f:Fighter,time:number){
  const labels:string[]=[];
  if(f.dream)labels.push(`迷梦策反 ${f.dream.controls}次 · 引火 ${f.dream.taunts}人次 · 诱导普攻 ${f.dream.hits}次 / 生命伤害 ${f.dream.damage} / 破盾 ${f.dream.shieldDamage}`);
  if(f.charm?.source!==undefined&&f.charm.until>time)
    labels.push(`迷梦控制 ${((f.charm.until-time)/4).toFixed(1)}s · 攻击 +${Math.round((f.charm.bonus??0)*100)}% · 来源阵亡即解除`);
  return labels;
}
