import type { Fighter } from "./types";

/** Instant splash footprint; later entrants are not retroactively affected. */
export function acidCells(target: { x: number; y: number }) {
  const cells: { x: number; y: number }[] = [];
  for (let y = Math.max(0, target.y - 1); y <= Math.min(7, target.y + 1); y++)
    for (let x = Math.max(0, target.x - 1); x <= Math.min(7, target.x + 1); x++)
      cells.push({ x, y });
  return cells;
}

/** Keep independent expirations; refreshing a weaker source cannot extend a stronger one. */
export function applyCorrosion(
  target: Fighter,
  source: number,
  armor: number,
  until: number,
) {
  target.corrosion = (target.corrosion ?? []).filter(
    (c) => c.source !== source,
  );
  target.corrosion.push({ source, armor, until });
}

export function corrosionArmor(target: Fighter, tick: number) {
  if (!target.corrosion) return 0;
  return target.corrosion.reduce(
    (highest, c) => (c.until > tick ? Math.max(highest, c.armor) : highest),
    0,
  );
}
