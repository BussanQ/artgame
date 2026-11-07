import type { Fighter } from "../engine/types";
import { project } from "./projection";

function fogBoard(c: CanvasRenderingContext2D) {
  const corners = [project(0,0),project(8,0),project(8,8),project(0,8)];
  c.beginPath();
  corners.forEach((p,i) => i ? c.lineTo(p.x,p.y) : c.moveTo(p.x,p.y));
  c.closePath();
}

/** The forecast is driven by committed spell state, including a dead holder's pending fog. */
export function drawSeaFogForecast(c: CanvasRenderingContext2D, fighters: Fighter[], time: number, reduced: boolean) {
  const pending = fighters.flatMap(f => f.equipmentSkills?.fog?.pending ? [f.equipmentSkills.fog.pending] : [])
    .filter(p => time >= p.start && time < p.landAt).sort((a,b) => a.landAt-b.landAt);
  if (!pending.length) return;
  const first = pending[0], progress = (time-first.start)/(first.landAt-first.start);
  c.save();
  fogBoard(c);
  c.fillStyle = "#95dcff0d";
  c.fill();
  c.strokeStyle = "#a6e8ff99";
  c.lineWidth = 2;
  c.setLineDash(reduced ? [] : [10,8]);
  c.lineDashOffset = reduced ? 0 : -time*2;
  c.stroke();
  c.clip();
  c.setLineDash([]);
  c.strokeStyle = "#a8e5ff44";
  c.lineWidth = 5;
  for (let i=0;i<3;i++) {
    const y = reduced ? 2+i*2 : (progress*8+i*2.6)%8;
    c.beginPath();
    for (let x=0;x<=8;x++) {
      const p=project(x,Math.min(8,Math.max(0,y+(reduced?0:Math.sin(x+progress*4)*0.16))));
      if (x) c.lineTo(p.x,p.y); else c.moveTo(p.x,p.y);
    }
    c.stroke();
  }
  c.restore();
  const label = project(0,0);
  c.save();
  c.fillStyle = "#d0f4ff";
  c.font = "600 16px sans-serif";
  c.textAlign = "left";
  c.fillText(`海雾 · ${((first.landAt-time)/4).toFixed(1)}秒后引爆${pending.length>1?` · ${pending.length}道`:""}`,label.x+8,label.y-12);
  c.restore();
}

export function drawSeaFogBurst(c: CanvasRenderingContext2D, age: number, reduced: boolean) {
  if (age<0 || age>3) return;
  c.save();
  c.globalAlpha = Math.max(0,1-age/3);
  fogBoard(c);
  c.fillStyle = reduced ? "#9ce8ff20" : "#a4edff38";
  c.strokeStyle = "#d1f5ff";
  c.lineWidth = reduced ? 2 : 4;
  c.shadowColor = "#83d9ff";
  c.shadowBlur = reduced ? 0 : 16;
  c.fill();
  c.stroke();
  c.restore();
}
