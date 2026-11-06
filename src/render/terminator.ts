import { TERMINATOR } from "../data/skills";
import type { CombatEffect, Fighter } from "../engine/types";
import { REST_POSE, type AttackPose } from "./melee";
import { project } from "./projection";

function circle(c: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  c.beginPath();
  for (let i = 0; i <= 64; i++) {
    const angle = i * Math.PI / 32,
      p = project(x + 0.5 + Math.cos(angle) * radius, y + 0.5 + Math.sin(angle) * radius);
    if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y);
  }
  c.closePath();
}
function clipBoard(c: CanvasRenderingContext2D) {
  c.beginPath(); [project(0,0),project(8,0),project(8,8),project(0,8)]
    .forEach((p,i) => i ? c.lineTo(p.x,p.y) : c.moveTo(p.x,p.y)); c.closePath(); c.clip();
}

export function terminatorPose(f: Pick<Fighter, "air">, time: number): AttackPose {
  const cast = f.air?.cast;
  if (cast?.kind !== "terminator") return { ...REST_POSE };
  const progress = Math.max(0, Math.min(1, 1 - (cast.next - time) /
    (cast.remaining === 2 ? TERMINATOR.windup : TERMINATOR.launchInterval)));
  return { ...REST_POSE, forward: -6 - 5 * progress, lift: -3,
    rotation: -0.025 - 0.025 * progress, scaleY: 0.97 };
}

/** Both warnings use the same fixed radius as collision; rounds retain their own launch/landing times. */
export function drawTerminators(
  c: CanvasRenderingContext2D, fighters: Fighter[], time: number, reducedMotion: boolean, layer: "area" | "missiles",
) {
  c.save(); if (layer === "area") clipBoard(c);
  for (const source of fighters) {
    const state = source.terminator; if (!state) continue;
    const cast = source.air?.cast;
    if (layer === "area" && source.hp > 0 && cast?.kind === "terminator") {
      circle(c,cast.to.x,cast.to.y,TERMINATOR.radius);
      c.fillStyle = "#e6b76d14"; c.strokeStyle = "#f5d497b3"; c.lineWidth = 1.5;
      c.setLineDash([6,5]); c.fill(); c.stroke(); c.setLineDash([]);
    }
    for (const missile of state.missiles) {
      if (layer === "area") {
        circle(c,missile.to.x,missile.to.y,TERMINATOR.radius);
        c.fillStyle = missile.kind === "large" ? "#efad6525" : "#f5d08a14";
        c.strokeStyle = missile.kind === "large" ? "#ffd39ac7" : "#e7cf969a";
        c.lineWidth = missile.kind === "large" ? 2 : 1; c.fill(); c.stroke();
        continue;
      }
      const progress = Math.max(0,Math.min(1,(time-missile.start)/(missile.landAt-missile.start)));
      const from = project(missile.from.x+0.5,missile.from.y+0.5), to = project(missile.to.x+0.5,missile.to.y+0.5);
      const x = from.x+(to.x-from.x)*progress,
        y = from.y-70+(to.y-from.y+70)*progress-(reducedMotion?0:Math.sin(progress*Math.PI)*85);
      const angle = Math.atan2(to.y-y,to.x-x), radius = missile.kind === "large" ? 10 : 6;
      c.save(); c.translate(x,y); c.rotate(angle);
      c.strokeStyle = "#ffc071b0"; c.lineWidth = radius*0.7;
      c.beginPath(); c.moveTo(-radius*3,0); c.lineTo(-radius,0); c.stroke();
      c.fillStyle = "#d3c9a3"; c.fillRect(-radius,-radius*0.45,radius*1.8,radius*0.9);
      c.fillStyle = "#fff0bc"; c.beginPath(); c.moveTo(radius*1.4,0);
      c.lineTo(radius*0.5,-radius*0.6); c.lineTo(radius*0.5,radius*0.6); c.closePath(); c.fill();
      c.restore();
    }
  }
  c.restore();
}

export function drawTerminatorEffect(c: CanvasRenderingContext2D, e: CombatEffect, age: number, reducedMotion: boolean) {
  if (e.kind === "cast" && e.name === TERMINATOR.name) return true;
  if (e.kind !== "pulse" || !["终结者小弹","终结者大弹"].includes(e.name)) return false;
  if (age < 0 || age > 3) return true;
  const large = e.name === "终结者大弹", p = project(e.to.x+0.5,e.to.y+0.5);
  c.save(); clipBoard(c); c.globalAlpha = Math.max(0,1-age/3);
  circle(c,e.to.x,e.to.y,TERMINATOR.radius);
  c.fillStyle = large ? "#ffb56134" : "#edce8930";
  c.strokeStyle = large ? "#ffe0ac" : "#e5d7aa"; c.lineWidth = large ? 2.5 : 1.5; c.fill(); c.stroke();
  if (!reducedMotion) {
    c.strokeStyle = large ? "#ffd091" : "#e8d3a1"; c.lineWidth = large ? 3 : 2;
    for (let i=0;i<10;i++) {
      const angle=i*Math.PI/5, reach=(large?45:28)+age*24;
      c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x+Math.cos(angle)*reach,p.y+Math.sin(angle)*reach*0.4-12-age*6);c.stroke();
    }
  }
  c.restore(); return true;
}

export function terminatorLabels(f: Pick<Fighter, "terminator" | "skillReadyAt">, time: number) {
  const state=f.terminator;if(!state)return [];
  const labels=[`小弹发射 ${state.smallLaunched}枚 · 大弹发射 ${state.largeLaunched}枚`,
    `导弹引爆 ${state.detonated}次 · 有效波及 ${state.hits}人次`];
  if(state.missiles.length)labels.push(`在途导弹 ${state.missiles.length}枚 · 落点半径3格`);
  if((f.skillReadyAt??0)>time)labels.push(`终结者冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
  return labels;
}
