import {
  isRanged,
  RANGED_ACTIONS,
  rangedPose,
  drawRangedAttack,
} from "./ranged";
import {
  isMelee,
  MELEE_ACTIONS,
  meleePose,
  REST_POSE,
  drawMeleeWeapon,
} from "./melee";
import { project, cellAt } from "./projection";
import { UNIT, UNITS } from "../data/units";
import type { Battle, Fighter, Piece, CombatEvent } from "../engine/types";
export interface SceneState {
  pieces: Piece[];
  selected: number | null;
  battle: Battle | null;
  time: number;
  phase: string;
  demo: boolean;
}
export const spriteUrl = (id: string) => `/assets/units/${id}.png`;
const W = 1280,
  H = 800;
// Project board corners to a trapezoid; sprites stay upright in screen space.
const pictures = new Map<string, HTMLImageElement>();
for (const u of UNITS) {
  const img = new Image();
  img.src = spriteUrl(u.id);
  pictures.set(u.id, img);
}
const terrain = new Image();
terrain.src = "/assets/arena/frontier.png";
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function polygon(
  c: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  fill: string,
  stroke?: string,
) {
  c.beginPath();
  points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.stroke();
  }
}
export class BattleScene {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private hover: number | null = null;
  private running = true;
  constructor(
    private canvas: HTMLCanvasElement,
    private state: () => SceneState,
    onCell: (cell: number) => void,
  ) {
    this.ctx = canvas.getContext("2d")!;
    canvas.width = W;
    canvas.height = H;
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.hover = cellAt(
        ((e.clientX - r.left) / r.width) * W,
        ((e.clientY - r.top) / r.height) * H,
      );
    });
    canvas.addEventListener("pointerleave", () => {
      this.hover = null;
    });
    canvas.addEventListener("click", (e) => {
      const r = canvas.getBoundingClientRect(),
        cell = cellAt(
          ((e.clientX - r.left) / r.width) * W,
          ((e.clientY - r.top) / r.height) * H,
        );
      if (cell !== null) onCell(cell);
    });
    const loop = (now: number) => {
      if (!this.running) return;
      this.draw(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  private draw(now: number) {
    const c = this.ctx,
      s = this.state();
    c.clearRect(0, 0, W, H);
    if (terrain.complete && terrain.naturalWidth) {
      const scale = Math.max(W / terrain.width, H / terrain.height),
        w = terrain.width * scale,
        h = terrain.height * scale;
      c.drawImage(terrain, (W - w) / 2, (H - h) / 2, w, h);
    } else {
      c.fillStyle = "#263b3c";
      c.fillRect(0, 0, W, H);
    }
    const shade = c.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, "#0c171528");
    shade.addColorStop(0.4, "#0b1d1820");
    shade.addColorStop(1, "#09191599");
    c.fillStyle = shade;
    c.fillRect(0, 0, W, H);
    // Raised perimeter, stone fascia, brass bevel and inset tile surface.
    const corners = [
      project(0, 0),
      project(8, 0),
      project(8, 8),
      project(0, 8),
    ];
    c.save();
    c.shadowColor = "#020707cc";
    c.shadowBlur = 35;
    c.shadowOffsetY = 20;
    polygon(c, corners, "#102223");
    c.restore();
    polygon(
      c,
      [
        corners[3],
        corners[2],
        { x: corners[2].x, y: corners[2].y + 25 },
        { x: corners[3].x, y: corners[3].y + 25 },
      ],
      "#293b37",
      "#7b846c",
    );
    if (terrain.complete && terrain.naturalWidth) {
      c.save();
      c.beginPath();
      corners.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      c.clip();
      c.drawImage(
        terrain,
        terrain.width * 0.32,
        terrain.height * 0.4,
        terrain.width * 0.35,
        terrain.height * 0.3,
        corners[3].x,
        corners[0].y,
        corners[2].x - corners[3].x,
        corners[3].y - corners[0].y,
      );
      c.restore();
    }
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const pos = y * 8 + x,
          chosen = s.pieces.some(
            (p) => p.uid === s.selected && p.position === pos,
          ),
          hovered = this.hover === pos && y >= 4 && s.phase === "prepare";
        const pts = [
          project(x, y),
          project(x + 1, y),
          project(x + 1, y + 1),
          project(x, y + 1),
        ];
        const base =
          (x + y) % 2 === 0 ? "rgba(128,144,117,.32)" : "rgba(43,65,52,.48)";
        polygon(
          c,
          pts,
          chosen ? "#a6985cbb" : hovered ? "#99bc8fb3" : base,
          "rgba(176,186,151,.28)",
        );
        // Thin irregular stone seams and grain; deterministic, no visual RNG flicker.
        c.strokeStyle = "#dae2b610";
        c.lineWidth = 1;
        const a = project(x + 0.12, y + 0.2),
          b = project(x + 0.84, y + 0.18);
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
        if (s.selected !== null && y >= 4 && s.phase === "prepare")
          polygon(c, pts, "#51cfb00b", "#79d7ad55");
      }
    c.lineWidth = 3;
    c.strokeStyle = "#a59c77";
    c.beginPath();
    corners.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.stroke();
    c.lineWidth = 1;
    const divider = [project(0, 4), project(8, 4)];
    c.strokeStyle = "#d8c38966";
    c.setLineDash([8, 10]);
    c.beginPath();
    c.moveTo(divider[0].x, divider[0].y);
    c.lineTo(divider[1].x, divider[1].y);
    c.stroke();
    c.setLineDash([]);
    for (let i = 0; i < 8; i++) {
      const p = project(i + 0.5, 8);
      c.font = "13px sans-serif";
      c.fillStyle = "#c9c9a9";
      c.textAlign = "center";
      c.fillText("ABCDEFGH"[i], p.x, p.y + 18);
    }
    const battle = s.battle;
    if (battle) {
      const index = Math.min(Math.floor(s.time), battle.frames.length - 1),
        fraction = s.time - Math.floor(s.time),
        a = battle.frames[index],
        b = battle.frames[Math.min(index + 1, battle.frames.length - 1)];
      const fs = a.fighters
        .map((f) => {
          const next = b.fighters.find((n) => n.uid === f.uid)!;
          return {
            ...f,
            x: lerp(f.x, next.x, fraction),
            y: lerp(f.y, next.y, fraction),
          };
        })
        .sort((a, b) => a.y - b.y);
      for (const f of fs) {
        let death = 0;
        if (f.hp <= 0) {
          let last = index;
          while (
            last > 0 &&
            battle.frames[last - 1].fighters.find((x) => x.uid === f.uid)!.hp <=
              0
          )
            last--;
          death = (index - last + fraction) / 2.5;
          if (death >= 1) continue;
        }
        let attack: { event: CombatEvent; progress: number } | undefined;
        const duration = isMelee(f.defId)
          ? Math.min(MELEE_ACTIONS[f.defId].duration, f.interval)
          : isRanged(f.defId)
            ? Math.min(RANGED_ACTIONS[f.defId].duration, f.interval)
            : 1;
        for (
          let n = index;
          n >= Math.max(1, index - Math.ceil(duration));
          n--
        ) {
          const event = battle.frames[n].events.find(
            (e) => e.attacker === f.uid,
          );
          if (event) {
            const progress = (s.time - n) / duration;
            if (progress < 1) attack = { event, progress };
            break;
          }
        }
        const hit = a.events.some((e) => e.target === f.uid);
        this.unit(f, now, s.selected, death, attack, hit && fraction < 0.35);
      }
      // Render recent events without skipping any at 2x/4x playback.
      for (let n = Math.max(1, index - 7); n <= index; n++)
        for (const e of battle.frames[n].events) {
          const age = s.time - n;
          if (age > 7.5) continue;
          const from = project(e.from.x + 0.5, e.from.y + 0.5),
            to = project(e.to.x + 0.5, e.to.y + 0.5);
          from.y -= 45;
          to.y -= 40;
          const color = e.skill ? "#a9f6ff" : e.ranged ? "#ffdb84" : "#e3f8ea";
          const attacker = battle.frames[n].fighters.find(
            (f) => f.uid === e.attacker,
          )!;
          const rangedId = isRanged(attacker.defId) ? attacker.defId : null;
          const duration = rangedId
            ? Math.min(RANGED_ACTIONS[rangedId].duration, attacker.interval)
            : 1;
          const impactAge = rangedId
            ? RANGED_ACTIONS[rangedId].impactAt * duration
            : 0.45;
          if (e.ranged && rangedId)
            drawRangedAttack(c, rangedId, age / duration, from, to, e.skill);
          if (!e.ranged && age < 1.5) {
            c.save();
            c.translate(to.x, to.y);
            c.globalAlpha = Math.max(0, 1 - age / 1.5);
            c.strokeStyle = color;
            c.lineWidth = e.skill ? 4 : 2;
            c.shadowColor = color;
            c.shadowBlur = 12;
            c.beginPath();
            if (e.ranged || e.skill)
              c.ellipse(
                0,
                20,
                8 + age * (e.skill ? 40 : 16),
                5 + age * (e.skill ? 18 : 8),
                0,
                0,
                Math.PI * 2,
              );
            else c.arc(0, 0, 20 + age * 15, -1.8, 1);
            c.stroke();
            for (let j = 0; j < 7; j++) {
              const theta = (j * Math.PI * 2) / 7;
              c.fillStyle = color;
              c.fillRect(
                Math.cos(theta) * age * 35,
                Math.sin(theta) * age * 25,
                3,
                3,
              );
            }
            c.restore();
          }
          if (age > impactAge && age < impactAge + 3) {
            c.save();
            c.globalAlpha = Math.max(0, 1 - (age - impactAge) / 3);
            c.font = `bold ${e.skill ? 23 : 17}px sans-serif`;
            c.textAlign = "center";
            c.lineWidth = 3;
            c.strokeStyle = "#18211c";
            const y = to.y - 20 - (age - impactAge) * 13;
            c.strokeText(String(e.amount), to.x, y);
            c.fillStyle = e.skill ? "#ffe191" : "#f2f5e3";
            c.fillText(String(e.amount), to.x, y);
            c.restore();
          }
        }
    } else {
      for (const p of [...s.pieces]
        .filter((p) => p.position !== null)
        .sort((a, b) => a.position! - b.position!)) {
        const d = UNIT[p.defId];
        this.unit(
          {
            uid: p.uid,
            defId: p.defId,
            star: p.star,
            side: 0,
            x: p.position! % 8,
            y: Math.floor(p.position! / 8),
            hp: d.hp,
            maxHp: d.hp,
            mana: 0,
          } as Fighter,
          now,
          s.selected,
          0,
          undefined,
          false,
        );
      }
      if (!s.pieces.some((p) => p.position !== null)) {
        c.fillStyle = "#eff0cecc";
        c.font = "20px sans-serif";
        c.textAlign = "center";
        c.shadowColor = "#14221d";
        c.shadowBlur = 8;
        c.fillText("招募棋子 · 部署于己方半场", W / 2, 480);
        c.font = "13px sans-serif";
        c.fillText("点击备战棋子，再点击棋盘落位", W / 2, 508);
        c.shadowBlur = 0;
      }
    }
    // Ambient drifting motes around the board perimeter.
    for (let i = 0; i < 20; i++) {
      const x = (i * 173 + now * 0.008) % W,
        y = H - ((i * 131 + now * 0.018) % H);
      if (x > 260 && x < 1020) continue;
      c.fillStyle = `rgba(255,216,135,${0.15 + Math.sin(now * 0.001 + i) * 0.12})`;
      c.beginPath();
      c.arc(x, y, 1.5, 0, Math.PI * 2);
      c.fill();
    }
  }
  private unit(
    f: Fighter,
    now: number,
    selected: number | null,
    death: number,
    attack: { event: CombatEvent; progress: number } | undefined,
    hit: boolean,
  ) {
    const c = this.ctx,
      p = project(f.x + 0.5, f.y + 0.65),
      depth = 0.78 + f.y * 0.035,
      d = UNIT[f.defId],
      im = pictures.get(f.defId),
      scale = (1 + (f.star - 1) * 0.12) * depth;
    c.save();
    c.globalAlpha = 1 - death;
    c.translate(p.x, p.y);
    c.fillStyle = "#06100b66";
    c.beginPath();
    c.ellipse(0, 0, 31 * scale, 11 * scale, 0, 0, Math.PI * 2);
    c.fill();
    const color = f.side === 0 ? "#76e5b6" : "#ff795d";
    c.strokeStyle = f.uid === selected ? "#fff0a0" : color;
    c.lineWidth = f.uid === selected ? 3 : 2;
    c.shadowColor = color;
    c.shadowBlur = 9;
    c.beginPath();
    c.ellipse(0, 0, 30 * scale, 10 * scale, 0, 0, Math.PI * 2);
    c.stroke();
    c.shadowBlur = 0;
    const sway = Math.sin(now * 0.002 + f.uid) * 1.2;
    c.save();
    const pose =
      !death && attack && isMelee(f.defId)
        ? meleePose(f.defId, attack.progress, attack.event.skill)
        : !death && attack && isRanged(f.defId)
          ? rangedPose(f.defId, attack.progress, attack.event.skill)
          : REST_POSE;
    const origin = attack
      ? project(attack.event.from.x + 0.5, attack.event.from.y + 0.5)
      : p;
    const destination = attack
      ? project(attack.event.to.x + 0.5, attack.event.to.y + 0.5)
      : p;
    const dx = destination.x - origin.x,
      dy = destination.y - origin.y,
      length = Math.hypot(dx, dy) || 1;
    const facing =
      attack && Math.abs(dx) > 1 ? Math.sign(dx) : f.side === 0 ? 1 : -1;

    c.translate(
      (dx / length) * pose.forward * scale,
      (dy / length) * pose.forward * scale - pose.lift * scale - sway,
    );
    c.rotate(facing * pose.rotation + death * 1.3);
    c.scale(facing * pose.scaleX, pose.scaleY);
    c.globalAlpha *= pose.alpha;
    if (im?.complete && im.naturalWidth) {
      const size = 130 * scale,
        w = (size * im.width) / Math.max(im.width, im.height),
        h = (size * im.height) / Math.max(im.width, im.height);
      if (hit) {
        c.shadowColor = "#f5d4ac";
        c.shadowBlur = 15;
      }
      if (pose.trail > 0) {
        c.save();
        c.globalAlpha *= pose.trail * 0.24;
        c.drawImage(im, -w / 2 - 14, -h + 4, w, h);
        c.drawImage(im, -w / 2 - 28, -h + 4, w, h);
        c.restore();
      }
      c.drawImage(im, -w / 2, -h + 4, w, h);
    } else {
      c.fillStyle = d.color;
      c.font = "35px serif";
      c.textAlign = "center";
      c.fillText(d.glyph, 0, -18);
    }
    c.restore();
    if (!death && attack && isMelee(f.defId)) {
      c.save();
      c.scale(facing, 1);
      drawMeleeWeapon(c, f.defId, attack.progress, scale, attack.event.skill);
      c.restore();
      if (
        f.defId === "titan" &&
        attack.progress > 0.4 &&
        attack.progress < 0.85
      ) {
        const t = (attack.progress - 0.4) / 0.45;
        c.save();
        c.globalAlpha = (1 - t) * 0.8;
        c.strokeStyle = "#f7bc78";
        c.lineWidth = 3;
        c.beginPath();
        c.ellipse(facing * 22, 4, 20 + t * 54, 7 + t * 18, 0, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
    }
    if (!death) {
      const top = -129 * scale;
      c.fillStyle = "#07130ede";
      c.fillRect(-27, top, 54, 7);
      c.fillStyle = color;
      c.fillRect(-26, top + 1, 52 * Math.max(0, f.hp / f.maxHp), 5);
      c.fillStyle = "#0c2028";
      c.fillRect(-26, top + 8, 52, 3);
      c.fillStyle = "#74bce7";
      c.fillRect(-26, top + 8, (52 * f.mana) / 100, 3);
      c.font = "bold 10px sans-serif";
      c.textAlign = "center";
      c.fillStyle = "#ffe4a1";
      c.fillText("★".repeat(f.star), 0, top - 5);
      c.font = "11px sans-serif";
      c.strokeStyle = "#0d1816";
      c.lineWidth = 3;
      c.strokeText(d.name, 0, 22);
      c.fillStyle = "#f1ecd6";
      c.fillText(d.name, 0, 22);
    }
    c.restore();
  }
}
