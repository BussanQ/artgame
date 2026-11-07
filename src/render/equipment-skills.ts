import type {CombatEffect,Fighter} from "../engine/types";
import {project} from "./projection";

export function drawEquipmentEffect(c:CanvasRenderingContext2D,e:CombatEffect,age:number,reduced:boolean){
  if(age<0||age>3)return;
  const a=project(e.from.x+0.5,e.from.y+0.5),b=project(e.to.x+0.5,e.to.y+0.5);
  c.save();c.globalAlpha=Math.max(0,1-age/3);c.strokeStyle="#d8b7ff";c.fillStyle="#f6e4ff";
  c.lineWidth=reduced?2:4;c.shadowColor="#b47eff";c.shadowBlur=reduced?0:12;
  c.beginPath();c.moveTo(a.x,a.y-42);c.lineTo(b.x,b.y-35);c.stroke();
  const r=8+(reduced?0:age*5);c.beginPath();c.moveTo(b.x,b.y-35-r);c.lineTo(b.x+r,b.y-35);c.lineTo(b.x,b.y-35+r);c.lineTo(b.x-r,b.y-35);c.closePath();c.stroke();
  c.restore();
}
export function equipmentSkillLabels(f:Fighter,time:number){
  const labels:string[]=[],s=f.equipmentSkills;
  if(s?.resonance)labels.push(`装备鞭笞 ${s.resonance.activations}次 · 生命伤害 ${s.resonance.damage} · 破盾 ${s.resonance.shieldDamage} · ${s.resonance.readyAt>time?`冷却 ${((s.resonance.readyAt-time)/4).toFixed(1)}s`:"就绪"}`);
  if(s?.call)labels.push(`装备呼号 ${s.call.activations}次 · 召唤 ${s.call.summoned}只 · ${s.call.readyAt>time?`冷却 ${((s.call.readyAt-time)/4).toFixed(1)}s`:"等待空位"}`);
  return labels;
}
