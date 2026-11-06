import { wushiActive } from "../engine/wushi";
import type { CombatEffect, Fighter } from "../engine/types";
import { REST_POSE, type AttackPose } from "./melee";
import { project } from "./projection";

export const wushiScale = (fighter: Pick<Fighter, "hp" | "wushi">, time: number) =>
  wushiActive(fighter, time) ? 1.14 : 1;

export function wushiPose(progress: number, casting = false): AttackPose {
  const t = Math.max(0, Math.min(1, progress));
  if (casting) return { ...REST_POSE, lift: -5*t, rotation: -0.12*t,
    scaleX: 1+0.05*t, scaleY: 1-0.06*t };
  const swing = Math.sin(t * Math.PI);
  return { ...REST_POSE, forward: 11*swing, lift: 3*swing,
    rotation: Math.sin(t*Math.PI*2)*0.28, scaleX: 1+0.1*swing,
    scaleY: 1-0.05*swing, impact: swing, trail: swing*0.7 };
}

export function drawWushiEffect(c: CanvasRenderingContext2D, effect: CombatEffect, age: number, reducedMotion: boolean) {
  if (!["无式", "无式结束", "无式横斩", "无式蓄力", "无式嘲讽"].includes(effect.name)) return false;
  if (age < 0 || age > 4) return true;
  const atTarget = effect.name === "无式横斩" || effect.name === "无式嘲讽";
  const point = project(atTarget ? effect.to.x+0.5 : effect.from.x+0.5,
    atTarget ? effect.to.y+0.5 : effect.from.y+0.5);
  c.save();c.translate(point.x,point.y);
  c.globalAlpha=Math.max(0,1-age/4);c.strokeStyle=effect.name==="无式嘲讽"?"#edbc76":"#cef0b8";c.lineWidth=effect.name==="无式横斩"?5:2;
  c.shadowColor="#8fd4ae";c.shadowBlur=reducedMotion?0:10;
  c.beginPath();
  if(effect.name==="无式横斩")
    c.ellipse(0,-28,42+age*9,18+age*3,-0.2,-Math.PI*0.9,Math.PI*0.7);
  else c.ellipse(0,0,28+age*8,10+age*3,0,0,Math.PI*2);
  c.stroke();c.restore();return true;
}

export function wushiLabels(fighter: Pick<Fighter,"hp"|"wushi"|"skillReadyAt">, time: number) {
  const state=fighter.wushi;if(!state)return [];
  const labels=[`无式变身 ${state.forms}次 · 横斩 ${state.sweeps}次 · 波及 ${state.splashHits}次`];
  if(state.taunts!==undefined)labels.push(`无式嘲讽施加 ${state.taunts}人次`);
  if(state.casting)labels.unshift(`无式蓄力 ${Math.max(0,(state.casting.until-time)/4).toFixed(1)}s`);
  if(wushiActive(fighter,time))labels.unshift(`无式 ${((state.until-time)/4).toFixed(1)}s · 护甲+${state.armor}`);
  if((fighter.skillReadyAt??0)>time)labels.push(`无式冷却 ${((fighter.skillReadyAt!-time)/4).toFixed(1)}s`);
  return labels;
}
