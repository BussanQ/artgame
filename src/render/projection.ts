const W = 1280;
export function project(x: number, y: number) {
  const scale = 0.68 + (0.32 * y) / 8;
  return { x: W / 2 + (x - 4) * 106 * scale, y: 152 + y * 63 };
}
export function cellAt(px: number, py: number): number | null {
  const y = (py - 152) / 63;
  if (y < 0 || y >= 8) return null;
  const x = (px - W / 2) / (106 * (0.68 + (0.32 * y) / 8)) + 4;
  if (x < 0 || x >= 8) return null;
  return Math.floor(y) * 8 + Math.floor(x);
}
