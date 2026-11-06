import { BOMBARDMENT } from "../data/skills";
import { bombardmentDirection } from "../engine/bombardment";
import type { CombatEffect, Fighter } from "../engine/types";
import { REST_POSE, type AttackPose } from "./melee";
import { project } from "./projection";

type Path = { from: { x: number; y: number }; dx: number; dy: number };
function rectangle(c: CanvasRenderingContext2D, path: Path, start: number, end: number) {
  const r = BOMBARDMENT.width / 2;
  c.beginPath();
  [[start, -r], [end, -r], [end, r], [start, r]].forEach(([along, across], i) => {
    const p = project(path.from.x + 0.5 + path.dx * along - path.dy * across,
      path.from.y + 0.5 + path.dy * along + path.dx * across);
    if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y);
  });
  c.closePath();
}
function clipBoard(c: CanvasRenderingContext2D) {
  c.beginPath();
  [project(0, 0), project(8, 0), project(8, 8), project(0, 8)]
    .forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
  c.closePath(); c.clip();
}
export function bombardmentPose(f: Pick<Fighter, "air">, time: number): AttackPose {
  const cast = f.air?.cast;
  if (cast?.kind !== "bombardment") return { ...REST_POSE };
  const t = Math.max(0, Math.min(1, 1 - (cast.next - time) / BOMBARDMENT.windup));
  return { ...REST_POSE, forward: -6 * t, lift: 7 * t,
    rotation: -0.025 * t, scaleX: 1 + 0.035 * t };
}
/** Ground footprint shares the combat rectangle; three small aircraft are one damage pass. */
export function drawBombardments(
  c: CanvasRenderingContext2D, fighters: Fighter[], time: number,
  reducedMotion: boolean, layer: "area" | "planes", craft: HTMLCanvasElement | null = null,
) {
  c.save();
  if (layer === "area") clipBoard(c);
  for (const source of fighters) {
    const state = source.bombardment; if (!state) continue;
    const cast = source.air?.cast;
    if (source.hp > 0 && cast?.kind === "bombardment") {
      const direction = bombardmentDirection(cast.from, cast.to);
      if (direction && layer === "area") {
        rectangle(c, { from: cast.from, ...direction }, 0, BOMBARDMENT.length);
        c.fillStyle = "#e0ba6c18"; c.strokeStyle = "#f8d38ab8";
        c.lineWidth = 1.5; c.setLineDash([8, 5]); c.fill(); c.stroke(); c.setLineDash([]);
      }
      if (layer === "planes") {
        const p = project(source.x + 0.5, source.y + 0.5);
        const progress = Math.max(0, Math.min(1, 1 - (cast.next - time) / BOMBARDMENT.windup));
        c.strokeStyle = "#b6f1e2"; c.lineWidth = 2;
        c.shadowColor = "#a0f2df"; c.shadowBlur = reducedMotion ? 0 : 12;
        for (const offset of [-1, 1]) {
          c.beginPath(); c.ellipse(p.x + offset * (22 + progress * 8), p.y - 68,
            5 + progress * 4, 9 + progress * 3, offset * 0.3, 0, Math.PI * 2); c.stroke();
        }
        c.shadowBlur = 0;
      }
    }
    for (const raid of state.raids) {
      if (layer === "area") {
        rectangle(c, raid, raid.traveled, BOMBARDMENT.length);
        c.fillStyle = raid.side === 0 ? "#74c7b714" : "#e6a76518";
        c.strokeStyle = raid.side === 0 ? "#9be6d36b" : "#f4bf7d7a";
        c.lineWidth = 1; c.fill(); c.stroke();
        continue;
      }
      const fraction = reducedMotion ? 0 : time - Math.floor(time);
      const traveled = Math.min(BOMBARDMENT.length, raid.traveled + BOMBARDMENT.speed * fraction);
      const x = raid.from.x + raid.dx * traveled, y = raid.from.y + raid.dy * traveled;
      for (const lane of [-1, 0, 1]) {
        const px = x - raid.dy * lane, py = y + raid.dx * lane;
        if (px < -0.5 || px > 7.5 || py < -0.5 || py > 7.5) continue;
        const p = project(px + 0.5, py + 0.5),
          nose = project(px + 0.5 + raid.dx * 0.4, py + 0.5 + raid.dy * 0.4);
        const angle = Math.atan2(nose.y - p.y, nose.x - p.x);
        c.save(); c.translate(p.x, p.y - 56); c.rotate(angle);
        if (craft) {
          c.save(); c.rotate(-Math.PI / 6);
          const width = 64, height = width * craft.height / craft.width;
          c.drawImage(craft, -width / 2, -height / 2, width, height); c.restore();
        } else {
          // A readable silhouette while the shared sprite cache loads.
          c.fillStyle = raid.side === 0 ? "#819f9b" : "#ae9279";
          c.strokeStyle = "#e9e1bf"; c.lineWidth = 1;
          c.beginPath(); c.moveTo(20, 0); c.lineTo(-11, -16); c.lineTo(-6, -4);
          c.lineTo(-17, -5); c.lineTo(-12, 0); c.lineTo(-17, 5);
          c.lineTo(-6, 4); c.lineTo(-11, 16); c.closePath(); c.fill(); c.stroke();
          c.fillStyle = "#d9fbf0"; c.fillRect(0, -2, 7, 4);
        }
        c.strokeStyle = "#88e8d7a0"; c.lineWidth = 2;
        c.beginPath(); c.moveTo(-12, -3); c.lineTo(-25, -3);
        c.moveTo(-12, 3); c.lineTo(-25, 3); c.stroke(); c.restore();
        // A visible falling bomb connects aircraft to the advancing ground strike.
        if (!reducedMotion) {
          const drop = fraction * 42;
          c.strokeStyle = "#f8daa1a6"; c.lineWidth = 2;
          c.beginPath(); c.moveTo(p.x, p.y - 44 + drop);
          c.lineTo(p.x, p.y - 37 + drop); c.stroke();
        }
      }
    }
  }
  c.restore();
}

export function drawBombardmentEffect(
  c: CanvasRenderingContext2D, effect: CombatEffect, age: number, reducedMotion: boolean,
) {
  if (effect.kind === "cast" && effect.name === BOMBARDMENT.name) return true;
  if (effect.kind !== "pulse" || effect.name !== "地毯轰炸") return false;
  if (age < 0 || age > 1.8) return true;
  const direction = bombardmentDirection(effect.from, effect.to); if (!direction) return true;
  c.save(); clipBoard(c);
  c.globalAlpha = Math.max(0, 1 - age / 1.8);
  for (const lane of [-1, 0, 1]) {
    const p = project(effect.to.x + 0.5 - direction.dy * lane,
      effect.to.y + 0.5 + direction.dx * lane);
    const radius = reducedMotion ? 16 : 8 + age * 15;
    c.fillStyle = "#eab4676b"; c.strokeStyle = "#f3dca2"; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(p.x, p.y, radius, radius * 0.4, 0, 0, Math.PI * 2);
    c.fill(); c.stroke();
    if (!reducedMotion) {
      c.strokeStyle = "#f6c37a"; c.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2 + lane * 0.7;
        c.beginPath(); c.moveTo(p.x, p.y);
        c.lineTo(p.x + Math.cos(angle) * radius * 0.6,
          p.y - 14 - Math.sin(angle) * radius * 0.5); c.stroke();
      }
    }
  }
  c.restore(); return true;
}

export function bombardmentLabels(f: Pick<Fighter, "bombardment" | "skillReadyAt">, time: number) {
  const state = f.bombardment; if (!state) return [];
  const labels = [`机群出动 ${state.launched}次 · 轰炸命中 ${state.hits}人次`];
  if (state.raids.length) labels.push(`正在轰炸 ${state.raids.length}支机群 · 出动后不受方舟阵亡影响`);
  if ((f.skillReadyAt ?? 0) > time) labels.push(`集团轰炸冷却 ${((f.skillReadyAt! - time) / 4).toFixed(1)}s`);
  return labels;
}
