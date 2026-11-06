import { JUNGLE } from "../data/skills";
import { jungleContains } from "../engine/jungle";
import type { CombatEffect, Fighter } from "../engine/types";
import { REST_POSE, type AttackPose } from "./melee";
import { project } from "./projection";

export function jungleChargePose(progress: number, reducedMotion = false): AttackPose {
  if (reducedMotion) return { ...REST_POSE };
  const p = Math.max(0, Math.min(1, progress));
  return { ...REST_POSE, scaleY: 1 - 0.16 * p, scaleX: 1 + 0.05 * p,
    lift: -12 * p, rotation: -0.035 * Math.sin(Math.PI * p) };
}
function circle(c: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  c.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = i / 64 * Math.PI * 2, p = project(x + 0.5 + Math.cos(a) * radius, y + 0.5 + Math.sin(a) * radius);
    if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y);
  }
  c.closePath();
}
function clipBoard(c: CanvasRenderingContext2D) {
  const points = [project(0,0), project(8,0), project(8,8), project(0,8)];
  c.beginPath(); points.forEach((p,i) => i ? c.lineTo(p.x,p.y) : c.moveTo(p.x,p.y));
  c.closePath(); c.clip();
}
function root(c: CanvasRenderingContext2D, x: number, y: number, height: number) {
  c.fillStyle = "#45523c"; c.strokeStyle = "#bceba2"; c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(x - 9,y + 3);
  c.quadraticCurveTo(x + 1,y - height * 0.4,x - 2,y - height);
  c.quadraticCurveTo(x + 11,y - height * 0.35,x + 8,y + 3);
  c.closePath(); c.fill(); c.stroke();
}
/** Exact four-tile circle, clipped to the board. The target can walk out before release. */
export function drawJungleTelegraphs(c: CanvasRenderingContext2D, fighters: Fighter[], time: number, reducedMotion: boolean) {
  c.save(); clipBoard(c);
  for (const f of fighters) {
    const cast = f.air?.cast;
    if (!f.jungle || f.hp <= 0 || cast?.kind !== "jungle") continue;
    circle(c, cast.from.x, cast.from.y, JUNGLE.radius);
    c.fillStyle = f.side === 0 ? "#9ed28a20" : "#edbd6820";
    c.strokeStyle = f.side === 0 ? "#c2e6a8bb" : "#edbd68bb";
    c.lineWidth = 2; c.setLineDash([6,4]); c.fill(); c.stroke(); c.setLineDash([]);
    const p = reducedMotion ? 0.6 : Math.max(0,Math.min(1,1-(cast.next-time)/JUNGLE.windup));
    circle(c,cast.from.x,cast.from.y,JUNGLE.radius*p); c.strokeStyle="#c6efa866"; c.stroke();
  }
  c.restore();
}
export function drawJungleEffect(c: CanvasRenderingContext2D, e: CombatEffect, age: number, reducedMotion: boolean) {
  if (!(e.kind === "pulse" && e.name === JUNGLE.name) &&
      !(e.kind === "stun" && e.name === "落地眩晕")) return false;
  if (age < 0 || age > 4) return true;
  c.save(); c.globalAlpha = Math.max(0,1-age/4);
  c.shadowColor="#b1e6a1"; c.shadowBlur=reducedMotion?0:8;
  if (e.kind === "pulse") {
    clipBoard(c);
    circle(c,e.from.x,e.from.y,JUNGLE.radius);
    c.fillStyle="#9aca7820"; c.strokeStyle="#daf4b4"; c.lineWidth=2.5; c.fill(); c.stroke();
    for (let y=0;y<8;y++) for (let x=0;x<8;x++) {
      if (!jungleContains(e.from,{x,y}) || (x+y)%2) continue;
      const p=project(x+0.5,y+0.5);
      root(c,p.x,p.y,reducedMotion?9:12+22*Math.sin(Math.PI*Math.min(1,age/4)));
    }
  } else {
    const p=project(e.to.x+0.5,e.to.y+0.5);
    c.strokeStyle="#e0efb9"; c.lineWidth=2;
    c.beginPath(); c.ellipse(p.x,p.y,24,9,0,0,Math.PI*2); c.stroke();
    root(c,p.x-15,p.y,11); root(c,p.x+15,p.y,11);
  }
  c.restore();
  return true;
}
