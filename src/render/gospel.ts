import { GOSPEL } from "../data/skills";
import { gospelActive } from "../engine/gospel";
import type { Fighter } from "../engine/types";
import { project } from "./projection";

/** The contour is inspected on demand; ordinary playback uses a small pulse. */
export function drawGospelField(
  c: CanvasRenderingContext2D,
  f: Fighter,
  time: number,
  reducedMotion: boolean,
  inspected: boolean,
) {
  if (!gospelActive(f)) return;
  const origin = project(f.x + 0.5, f.y + 0.65);
  c.save();
  if (inspected) {
    c.beginPath();
    [project(0, 0), project(8, 0), project(8, 8), project(0, 8)].forEach(
      (point, i) => i ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y),
    );
    c.closePath();
    c.clip();
    c.beginPath();
    for (let i = 0; i <= 48; i++) {
      const angle = i * Math.PI / 24;
      const point = project(f.x + 0.5 + Math.cos(angle) * GOSPEL.radius,
        f.y + 0.5 + Math.sin(angle) * GOSPEL.radius);
      if (i) c.lineTo(point.x, point.y); else c.moveTo(point.x, point.y);
    }
    c.closePath();
    c.fillStyle = "#63e9e00b";
    c.strokeStyle = "#8effe680";
    c.lineWidth = 2;
    c.setLineDash([6, 5]);
    c.fill();
    c.stroke();
    c.setLineDash([]);
  }
  const age = Math.max(0, time - f.gospelAura!.lastTick);
  const pulse = reducedMotion ? 0 : Math.max(0, 1 - age / 3);
  c.strokeStyle = `rgba(142,255,230,${0.2 + pulse * 0.5})`;
  c.lineWidth = 1.5;
  c.beginPath();
  c.ellipse(origin.x, origin.y, 29 + pulse * 16, 10 + pulse * 5, 0, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}
