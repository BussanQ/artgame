import {FORMLESS} from "../data/skills";
import {formlessActive} from "../engine/formless";
import type {Fighter} from "../engine/types";
import {project} from "./projection";

/** Low-opacity solid sprite stays legible; rings make the exact active window visible. */
export function drawFormless(c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reduced:boolean){
 c.save();
 for(const f of fighters){
  if(!formlessActive(f,time))continue;
  const p=project(f.x+0.5,f.y+0.5),start=f.formless!.active!.start,remaining=(f.formless!.active!.until-time)/FORMLESS.duration;
  c.globalAlpha=0.7;c.strokeStyle="#bce6fa";c.lineWidth=2;c.beginPath();c.ellipse(p.x,p.y,31,10,0,-Math.PI/2,-Math.PI/2+Math.PI*2*remaining);c.stroke();
  if(!reduced){
   const pulse=Math.max(0,1-(time-start)/3);c.globalAlpha=pulse*0.6;c.beginPath();c.ellipse(p.x,p.y-32,22+18*(1-pulse),35+18*(1-pulse),0,0,Math.PI*2);c.stroke();
   c.globalAlpha=0.35;const rise=(time-start)%4;c.beginPath();for(let i=0;i<2;i++){c.moveTo(p.x-17+i*28,p.y-60-rise*2);c.lineTo(p.x-12+i*28,p.y-65-rise*2);c.lineTo(p.x-7+i*28,p.y-60-rise*2);}c.stroke();
  }
 }
 c.restore();
}
export function formlessLabels(f:Fighter,time:number){
 const s=f.formless;if(!s)return [];
 const labels=[`无形 ${s.activations}次 · 隐形普攻有效命中 ${s.hits}次 · 生命伤害 ${s.damage} · 破盾 ${s.shieldDamage}`];
 if(f.regeneration&&!f.executionPuppet)labels.push(`自然恢复 ${f.regeneration*4} 生命/秒`);
 if(formlessActive(f,time))labels.push(`无形隐身 ${((s.active!.until-time)/4).toFixed(1)}s · 攻速 +${Math.round(FORMLESS.haste[f.star-1]*100)}% · 范围伤害可命中`);
 if((f.skillReadyAt??0)>time&&!f.executionPuppet)labels.push(`无形冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
 return labels;
}
