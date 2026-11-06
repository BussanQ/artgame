import type { Fighter } from "../engine/types";
import { project } from "./projection";

export function tarCells(x: number, y: number) {
  return [
    [x, y],
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ].filter(([x, y]) => x >= 0 && x < 8 && y >= 0 && y < 8);
}

/** Multiple riders can mark one carrier. Show the earliest fuse and total charge count once. */
export function tarMarkers(fighters: readonly Fighter[], time: number) {
  const markers = new Map<
    string,
    { x: number; y: number; until: number; count: number; side: 0 | 1 }
  >();
  const carriers = new Map(fighters.map((f) => [f.uid, f]));
  for (const source of fighters)
    for (const bomb of source.tar?.bombs ?? []) {
      if (bomb.until <= time) continue;
      const carrier = bomb.attached ? carriers.get(bomb.target) : undefined;
      const x = carrier && carrier.hp > 0 ? carrier.x : bomb.x;
      const y = carrier && carrier.hp > 0 ? carrier.y : bomb.y;
      const key = `${source.side}:${bomb.attached ? `unit:${bomb.target}` : `cell:${x}:${y}`}`;
      const marker = markers.get(key);
      if (marker) {
        marker.until = Math.min(marker.until, bomb.until);
        marker.count++;
      } else
        markers.set(key, {
          x,
          y,
          until: bomb.until,
          count: 1,
          side: source.side,
        });
    }
  return [...markers.values()];
}

/** Paint cells below the units and legible counters above them, using only this replay frame. */
export function drawTarBombs(
  c: CanvasRenderingContext2D,
  fighters: readonly Fighter[],
  time: number,
  reducedMotion: boolean,
  layer: "area" | "labels" | "all" = "all",
) {
  for (const bomb of tarMarkers(fighters, time)) {
    const centerX = bomb.x,
      centerY = bomb.y;
    c.save();
    c.fillStyle = bomb.side === 0 ? "#eeaf493d" : "#f36a4c45";
    c.strokeStyle = bomb.side === 0 ? "#ffd287" : "#ff927a";
    c.lineWidth = 2;
    if (layer !== "labels")
      for (const [x, y] of tarCells(centerX, centerY)) {
        const points = [
          project(x, y),
          project(x + 1, y),
          project(x + 1, y + 1),
          project(x, y + 1),
        ];
        c.beginPath();
        points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.closePath();
        c.fill();
        c.stroke();
      }
    if (layer === "area") {
      c.restore();
      continue;
    }
    const p = project(centerX + 0.5, centerY + 0.5);
    const seconds = Math.max(0, (bomb.until - time) / 4);
    const radius =
      (bomb.count > 1 ? 43 : 37) + (reducedMotion ? 0 : Math.sin(time * 2));
    c.fillStyle = "#211b15ed";
    c.beginPath();
    c.ellipse(p.x, p.y + 8, radius, 14, 0, 0, Math.PI * 2);
    c.fill();
    c.font = "bold 18px sans-serif";
    c.textAlign = "center";
    c.fillStyle = "#ffe1a3";
    c.strokeStyle = "#171b16";
    c.lineWidth = 3;
    const label = `${bomb.count > 1 ? `×${bomb.count}` : "爆"} ${seconds.toFixed(1)}s`;
    c.strokeText(label, p.x, p.y + 14);
    c.fillText(label, p.x, p.y + 14);
    c.restore();
  }
}
