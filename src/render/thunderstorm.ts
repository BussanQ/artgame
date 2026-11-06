import { THUNDERSTORM } from "../data/skills";
import type { Fighter } from "../engine/types";
import { project } from "./projection";

/** Telegraph and projectile use the same one-tile width as swept combat collision. */
export function drawThunderstorm(
  c: CanvasRenderingContext2D, fighters: Fighter[], time: number,
  reducedMotion: boolean, layer: "area" | "bolts",
) {
  c.save();
  if (layer === "area") {
    const corners = [project(0,0),project(8,0),project(8,8),project(0,8)];
    c.beginPath();
    corners.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));
    c.closePath(); c.clip();
  }
  for (const fighter of fighters) {
    if (!fighter.storm) continue;
    const cast = fighter.air?.cast;
    if (layer === "area" && fighter.hp > 0 && cast?.kind === "storm") {
      const dx = cast.to.x-cast.from.x,dy=cast.to.y-cast.from.y;
      const length = Math.hypot(dx,dy) || 1;
      const ux=dx/length,uy=dy/length,r=THUNDERSTORM.width/2;
      const points = [[-uy*r,ux*r],[ux*THUNDERSTORM.range-uy*r,uy*THUNDERSTORM.range+ux*r],
        [ux*THUNDERSTORM.range+uy*r,uy*THUNDERSTORM.range-ux*r],[uy*r,-ux*r]]
        .map(([x,y])=>project(cast.from.x+0.5+x,cast.from.y+0.5+y));
      c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));
      c.closePath();c.fillStyle="#79e9ff20";c.strokeStyle="#9ff4ff99";
      c.lineWidth=1.5;c.setLineDash([5,5]);c.fill();c.stroke();c.setLineDash([]);
    }
    if (layer !== "bolts") continue;
    if (fighter.hp > 0 && cast?.kind === "storm") {
      const at=project(fighter.x+0.5,fighter.y+0.5);
      const progress=Math.max(0,Math.min(1,1-(cast.next-time)/THUNDERSTORM.windup));
      c.fillStyle="#b6f5ff";c.shadowColor="#43c9ff";c.shadowBlur=14;
      c.beginPath();c.arc(at.x,at.y-60,5+progress*12,0,Math.PI*2);c.fill();
    }
    for (const bolt of fighter.storm.bolts) {
      const fraction = reducedMotion ? 0 : time-Math.floor(time);
      const x=bolt.x+bolt.dx*THUNDERSTORM.speed*fraction;
      const y=bolt.y+bolt.dy*THUNDERSTORM.speed*fraction;
      const p=project(x+0.5,y+0.5),tail=project(x-bolt.dx+0.5,y-bolt.dy+0.5);
      c.lineWidth=6;c.strokeStyle="#6ee3ff80";c.shadowColor="#57d4ff";c.shadowBlur=18;
      c.beginPath();c.moveTo(tail.x,tail.y-35);c.lineTo(p.x,p.y-35);c.stroke();
      c.fillStyle="#dfffff";c.beginPath();c.arc(p.x,p.y-35,9,0,Math.PI*2);c.fill();
      c.lineWidth=2;c.strokeStyle="#b6fdff";c.beginPath();
      c.ellipse(p.x,p.y-35,16,12,time*1.4,0,Math.PI*2);c.stroke();
    }
  }
  c.restore();
}
