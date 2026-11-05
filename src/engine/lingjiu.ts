import { DEATH_SONG } from "../data/skills";

type Point = { x: number; y: number };
/** One self-centered circle; renderer and combat use exactly the same footprint. */
export function inDeathSong(center: Point, point: Point) {
  return (
    Math.hypot(point.x - center.x, point.y - center.y) <=
    DEATH_SONG.radius + 1e-9
  );
}
export function deathSongCells(center: Point) {
  const cells: Point[] = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      if (inDeathSong(center, { x, y })) cells.push({ x, y });
  return cells;
}
