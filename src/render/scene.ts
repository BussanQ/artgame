import { taotieScale } from "./taotie";
import { wushiPose, wushiScale } from "./wushi";
import { wushiActive } from "../engine/wushi";
import { drawTarBombs } from "./tar";
import { drawGospelField } from "./gospel";
import { drawThunderstorm } from "./thunderstorm";
import { drawShuriken } from "./shuriken";
import { drawSecretOrbs, secretOrbPose } from "./secret-orb";
import { drawJungleTelegraphs, jungleChargePose } from "./jungle";
import { JUNGLE } from "../data/skills";
import { unitDefinition, unitSprite } from "../data/unit-stats";
import { CURRENT_COMBAT_VERSION, type CombatVersion } from "../engine/types";
import { isPhoenixEgg } from "../engine/phoenix";
import { pickBattleFighter, fighterBattleMarkup } from "./battle-inspection";
import { knockupLift, burrowPose } from "./beast-presentation";
import { hawkGroundPose } from "./metamorph-presentation";
import { skillGauge } from "../engine/triggers";
import {
  bullTransformation,
  bullFormPose,
  drawBullCharge,
  deathFade,
  type BullTransformation,
} from "./combat-presentation";
import { fighterName, fighterSprite } from "../engine/summons";
import { ARHAT_QI } from "../data/skills";
import { QUALITY, type Preferences } from "../ui/preferences";
import { FrameGate } from "./frame-policy";
import { attackInterval } from "../engine/abilities";
import {
  drawSkillEffect,
  drawStatuses,
  drawAirTelegraph,
} from "./skill-effects";
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
  ironapeChargePose,
  bladeStormPose,
  REST_POSE,
  drawMeleeWeapon,
} from "./melee";
import { project, cellAt } from "./projection";
import { UNIT } from "../data/units";
import type { Battle, Fighter, Piece, CombatEvent } from "../engine/types";
export interface SceneState {
  version?: CombatVersion;
  pieces: Piece[];
  selected: number | null;
  inspected?: number | null;
  battle: Battle | null;
  time: number;
  phase: string;
  demo: boolean;
  paused: boolean;
}
export const spriteUrl = (id: string) => `/assets/units/${id}.png`;
const W = 1280,
  H = 800;
// Wide fins and wings should remain readable without covering neighboring pieces.
const SPRITE_SCALES: Record<string, number> = {
  "acolyte-gospel": 0.76,
  "stormcaller-thunderstorm": 0.94,
  "treant-jungle": 0.9,
  "master-wushi": 0.92,
  "panda-shuriken": 0.92,
  "monk-orb": 0.88,
  fish: 0.72,
  dragonfly: 0.85,
  deer: 0.9,
};
// Project board corners to a trapezoid; sprites stay upright in screen space.
const pictures = new Map<string, HTMLCanvasElement | null>();
function picture(id: string): HTMLCanvasElement | null {
  if (!pictures.has(id)) {
    pictures.set(id, null);
    const image = new Image();
    image.onload = () => {
      const cache = document.createElement("canvas");
      const scale = Math.min(
        1,
        256 / Math.max(image.naturalWidth, image.naturalHeight),
      );
      cache.width = Math.max(1, Math.round(image.naturalWidth * scale));
      cache.height = Math.max(1, Math.round(image.naturalHeight * scale));
      cache.getContext("2d")!.drawImage(image, 0, 0, cache.width, cache.height);
      pictures.set(id, cache);
      image.onload = null;
    };
    image.src = spriteUrl(id);
  }
  return pictures.get(id) ?? null;
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
  private gate = new FrameGate();
  private visible = true;
  private observer: IntersectionObserver;
  private board = document.createElement("canvas");
  private boardKey = "";
  private motionReduced = false;
  private inspector = document.createElement("aside");
  private inspectorBody = document.createElement("div");
  private paintedFighters: Fighter[] = [];
  private hoverFighter: number | null = null;
  private pinnedFighter: number | null = null;
  private inspectorKey = "";
  private closeInspection = () => {
    this.pinnedFighter = this.hoverFighter = null;
    this.onInspect?.(null);
    this.inspector.hidden = true;
  };
  constructor(
    private canvas: HTMLCanvasElement,
    private state: () => SceneState,
    onCell: (cell: number) => void,
    private options: () => Preferences,
    private onInspect?: (uid: number | null) => void,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.pinnedFighter = this.state().inspected ?? null;
    this.inspector.className = "battle-inspector";
    this.inspectorBody.className = "battle-inspector-body";
    this.inspector.setAttribute("role", "region");
    this.inspector.setAttribute("aria-label", "棋子战斗详情");
    this.inspector.hidden = true;
    this.inspector.innerHTML =
      '<button type="button" data-close-battle-info aria-label="关闭棋子战斗详情">×</button>';
    this.inspector.append(this.inspectorBody);
    canvas.closest(".battle-viewport")?.append(this.inspector);
    this.inspector.addEventListener("click", (e) => {
      if ((e.target as Element).closest("[data-close-battle-info]"))
        this.closeInspection();
    });
    canvas.width = W;
    canvas.height = H;
    this.board.width = W;
    this.board.height = H;
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
    });
    this.observer.observe(canvas);
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.hover = cellAt(
        ((e.clientX - r.left) / r.width) * W,
        ((e.clientY - r.top) / r.height) * H,
      );
      this.hoverFighter = this.pickAt(e.clientX, e.clientY);
    });
    canvas.addEventListener("pointerleave", () => {
      this.hover = null;
      this.hoverFighter = null;
      if (this.pinnedFighter === null) this.inspector.hidden = true;
    });
    canvas.addEventListener("click", (e) => {
      if (this.state().battle) {
        this.pinnedFighter = this.pickAt(e.clientX, e.clientY);
        this.onInspect?.(this.pinnedFighter);
        this.hoverFighter = null;
        if (this.pinnedFighter === null) this.inspector.hidden = true;
        return;
      }
      const r = canvas.getBoundingClientRect(),
        cell = cellAt(
          ((e.clientX - r.left) / r.width) * W,
          ((e.clientY - r.top) / r.height) * H,
        );
      if (cell !== null) onCell(cell);
    });
    const loop = (now: number) => {
      if (!this.running) return;
      const state = this.state(),
        settings = this.options();
      const fps =
        state.battle &&
        !state.paused &&
        (state.phase === "battle" || state.phase === "demo")
          ? QUALITY[settings.quality].fps
          : 15;
      if (this.gate.ready(now, fps, document.hidden || !this.visible))
        this.draw(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.inspector.remove();
  }
  dismissInspection() {
    if (this.pinnedFighter === null && this.hoverFighter === null) return false;
    this.closeInspection();
    return true;
  }
  private pickAt(clientX: number, clientY: number) {
    const s = this.state(),
      battle = s.battle;
    if (!battle) return null;
    const r = this.canvas.getBoundingClientRect();
    return pickBattleFighter(
      this.paintedFighters,
      {
        x: ((clientX - r.left) / r.width) * W,
        y: ((clientY - r.top) / r.height) * H,
      },
      s.time,
    );
  }
  private showInspection(f: Fighter, time: number, labels: string[]) {
    const markup = fighterBattleMarkup(f, time, labels);
    if (markup !== this.inspectorKey) {
      this.inspectorBody.innerHTML = markup;
      this.inspectorKey = markup;
    }
    this.inspector.classList.toggle("is-pinned", this.pinnedFighter !== null);
    this.inspector.hidden = false;
  }
  private drawBoard(c: CanvasRenderingContext2D, s: SceneState) {
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
  }
  private draw(now: number) {
    const c = this.ctx,
      s = this.state(),
      preferences = this.options(),
      quality = QUALITY[preferences.quality];
    this.motionReduced = preferences.reducedMotion;
    if (
      this.canvas.width !== quality.width ||
      this.canvas.height !== quality.height
    ) {
      this.canvas.width = quality.width;
      this.canvas.height = quality.height;
    }
    c.setTransform(quality.width / W, 0, 0, quality.height / H, 0, 0);
    const key = [
      this.hover,
      s.selected,
      s.pieces.find((p) => p.uid === s.selected)?.position,
      s.phase,
      terrain.naturalWidth,
    ].join(":");
    if (key !== this.boardKey) {
      this.drawBoard(this.board.getContext("2d")!, s);
      this.boardKey = key;
    }
    c.clearRect(0, 0, W, H);
    c.drawImage(this.board, 0, 0);
    const battle = s.battle;
    if (battle) {
      const index = Math.min(Math.floor(s.time), battle.frames.length - 1),
        fraction = preferences.reducedMotion ? 0 : s.time - Math.floor(s.time),
        a = battle.frames[index],
        b = battle.frames[Math.min(index + 1, battle.frames.length - 1)];
      const inspected = a.fighters.find(
        (f) => f.uid === (this.pinnedFighter ?? this.hoverFighter),
      );
      if (!inspected) this.inspector.hidden = true;
      else if (inspected.hp <= 0)
        this.showInspection(inspected, s.time, ["已阵亡"]);
      const fs = a.fighters
        .map((f) => {
          const next = b.fighters.find((n) => n.uid === f.uid)!;
          const transformation = bullTransformation(
            battle,
            f,
            s.time,
            this.motionReduced,
          );
          return {
            ...f,
            transformation,
            x: transformation
              ? transformation.position.x
              : b.effects.some(
                    (e) => e.kind === "teleport" && e.target === f.uid,
                  )
                ? f.x
                : lerp(f.x, next.x, fraction),
            y: transformation
              ? transformation.position.y
              : b.effects.some(
                    (e) => e.kind === "teleport" && e.target === f.uid,
                  )
                ? f.y
                : lerp(f.y, next.y, fraction),
          };
        })
        .sort((a, b) => a.y - b.y);
      this.paintedFighters = fs;
      for (const f of fs) drawAirTelegraph(c, f, s.time, this.motionReduced);
      drawTarBombs(c, fs, s.time, this.motionReduced, "area");
      drawThunderstorm(c, fs, s.time, this.motionReduced, "area");
      drawShuriken(c, fs, s.time, this.motionReduced, "area");
      drawSecretOrbs(c, fs, s.time, this.motionReduced, "area");
      drawJungleTelegraphs(c, fs, s.time, this.motionReduced);
      for (const f of fs)
        drawGospelField(c, f, s.time, this.motionReduced,
          f.uid === (this.pinnedFighter ?? this.hoverFighter));
      for (const f of fs) {
        const death = deathFade(battle, f.uid, index, s.time);
        if (death >= 1) continue;
        if (f.transformation)
          drawBullCharge(
            c,
            f.transformation,
            quality.particles,
            this.motionReduced,
          );
        let attack: { event: CombatEvent; progress: number } | undefined;
        const duration = f.hawkForm?.active
          ? 1
          : isMelee(f.defId, s.version)
            ? Math.min(
                MELEE_ACTIONS[f.defId].duration,
                attackInterval(f, s.time),
              )
            : isRanged(f.defId, s.version)
              ? Math.min(
                  RANGED_ACTIONS[f.defId].duration,
                  attackInterval(f, s.time),
                )
              : 1;
        for (
          let n = index;
          n >= Math.max(1, index - Math.ceil(duration));
          n--
        ) {
          const cast = battle.frames[n].effects.find(
            (e) => e.kind === "cast" && e.source === f.uid,
          );
          const event =
            battle.frames[n].events.find(
              (e) => e.attacker === f.uid && e.primary,
            ) ??
            (cast
              ? {
                  attacker: f.uid,
                  target: cast.target,
                  amount: 0,
                  absorbed: 0,
                  damageType: "magic" as const,
                  primary: true,
                  skill: true,
                  ranged: f.range > 1,
                  from: cast.from,
                  to: cast.to,
                }
              : undefined);
          if (event) {
            const progress = (s.time - n) / duration;
            if (progress < 1) attack = { event, progress };
            break;
          }
        }
        const hit = a.events.some((e) => e.target === f.uid && !e.evaded);
        this.unit(
          f,
          now,
          s.selected,
          death,
          (f.secretOrb || f.shuriken || f.storm || f.jungle) && attack?.event.skill ? undefined : attack,
          hit && fraction < 0.35,
          s.time,
          f.transformation ?? undefined,
        );
      }
      drawTarBombs(c, fs, s.time, this.motionReduced, "labels");
      drawThunderstorm(c, fs, s.time, this.motionReduced, "bolts");
      drawShuriken(c, fs, s.time, this.motionReduced, "blades");
      drawSecretOrbs(c, fs, s.time, this.motionReduced, "orb");
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
          const rangedId = isRanged(attacker.defId, s.version) ? attacker.defId : null;
          const duration = rangedId
            ? Math.min(
                RANGED_ACTIONS[rangedId].duration,
                attackInterval(attacker, n),
              )
            : 1;
          const impactAge = (attacker.secretOrb || attacker.shuriken) && e.skill ? 0 : rangedId
            ? RANGED_ACTIONS[rangedId].impactAt * duration
            : 0.45;
          if (
            !preferences.reducedMotion &&
            e.ranged &&
            rangedId &&
            e.primary &&
            !attacker.lightningChain &&
            !((attacker.secretOrb || attacker.shuriken || attacker.qiSkill || attacker.taotie || attacker.tar || attacker.storm) && e.skill)
          )
            drawRangedAttack(
              c,
              rangedId,
              age / duration,
              from,
              e.evaded ? { x: to.x + 22, y: to.y - 18 } : to,
              e.skill || !!e.empowered,
              !!attacker.qiSkill,
            );
          if (
            !preferences.reducedMotion &&
            !e.evaded &&
            !e.ranged &&
            age < 1.5
          ) {
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
          if (
            preferences.damageNumbers &&
            age > impactAge &&
            age < impactAge + 3
          ) {
            c.save();
            c.globalAlpha = Math.max(0, 1 - (age - impactAge) / 3);
            c.font = `bold ${e.skill ? 23 : 17}px sans-serif`;
            c.textAlign = "center";
            c.lineWidth = 3;
            c.strokeStyle = "#18211c";
            const y =
              to.y -
              20 -
              (preferences.reducedMotion ? 0 : (age - impactAge) * 13);
            const label = e.immune
              ? "不朽"
              : e.evaded
                ? "闪避"
                : e.amount > 0
                  ? `${e.gale === 10 ? "疾风 " : e.empowered ? "暴击 " : ""}${e.amount}`
                  : `吸收 ${e.absorbed}`;
            c.strokeText(label, to.x, y);
            c.fillStyle =
              e.amount === 0
                ? "#9cdeff"
                : e.damageType === "magic"
                  ? "#c1acff"
                  : e.skill || e.empowered
                    ? "#ffe191"
                    : "#f2f5e3";
            c.fillText(label, to.x, y);
            c.restore();
          }
        }
      for (let n = Math.max(1, index - 4); n <= index; n++)
        for (const e of battle.frames[n].effects) {
          // Bull charge uses its own grounded trail and impact, not a teleport portal.
          if (
            e.kind === "teleport" &&
            e.name === "冲锋" &&
            battle.frames[n].fighters.some(
              (f) => f.uid === e.source && f.defId === "bull",
            )
          )
            continue;
          drawSkillEffect(c, e, s.time - n, preferences.reducedMotion);
        }
    } else {
      for (const p of [...s.pieces]
        .filter((p) => p.position !== null)
        .sort((a, b) => a.position! - b.position!)) {
        const version = s.version ?? CURRENT_COMBAT_VERSION;
        const d = unitDefinition(p.defId, version);
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
          0,
          undefined,
          unitSprite(p.defId, version),
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
    for (
      let i = 0;
      i < (preferences.reducedMotion ? 0 : quality.particles);
      i++
    ) {
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
    time = 0,
    transformation?: BullTransformation,
    spriteId = fighterSprite(f),
  ) {
    if (f.wushi) picture("master-wushi");
    const version = this.state().version;
    const throwCast = f.shuriken?.casting;
    const throwBlade = f.shuriken?.blades.find(blade=>time-blade.start<1.8);
    const secretTarget=f.secretOrb?.casting?.to??f.secretOrb?.channel;
    const c = this.ctx,
      p = project(f.x + 0.5, f.y + 0.65),
      depth = 0.78 + f.y * 0.035,
      d = UNIT[f.defId],
      im = picture(spriteId),
      scale =
        (1 + (f.star - 1) * 0.12) *
        depth *
        (f.summon ? 0.7 : 1) *
        taotieScale(f, time) * wushiScale(f, time);
    const transformed = f.defId === "bull" ? picture("bull-charge") : null;
    c.save();
    c.globalAlpha = (1 - death) * (f.immortal?.spent && f.hp > 0 ? 0.62 : 1);
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
    const sway = this.motionReduced ? 0 : Math.sin(now * 0.002 + f.uid) * 1.2;
    c.save();
    const pose = isPhoenixEgg(f)
      ? REST_POSE
      : !this.motionReduced && !death && secretTarget
        ? secretOrbPose(f,time)
      : !this.motionReduced && !death && throwCast
        ? rangedPose("panda",Math.max(0.01,Math.min(0.33,(time-throwCast.start)/2*0.33)),true)
      : !this.motionReduced && !death && throwBlade
        ? rangedPose("panda",Math.min(0.95,0.35+(time-throwBlade.start)/1.8*0.6),true)
      : !this.motionReduced && !death && f.wushi?.casting
        ? wushiPose(1-(f.wushi.casting.until-time)/4,true)
      : !this.motionReduced && !death && attack && wushiActive(f,time)
        ? wushiPose(attack.progress)
      : transformation
        ? bullFormPose(transformation, this.motionReduced)
        : !this.motionReduced && !death && f.burrowSkill && attack?.event.skill
          ? burrowPose(attack.progress)
          : !this.motionReduced && !death && f.bladeStorm
            ? bladeStormPose(time)
            : !this.motionReduced && !death && f.jungle && f.air?.cast?.kind === "jungle"
              ? jungleChargePose(1 - (f.air.cast.next - time) / JUNGLE.windup)
            : !this.motionReduced && !death && f.storm && f.air?.cast?.kind === "storm"
              ? rangedPose("stormcaller", Math.max(0, Math.min(0.44,
                  (1 - (f.air.cast.next - time) / 4) * 0.44)), true, false, false, true)
            : !this.motionReduced && !death && f.air?.cast?.kind === "ironape"
              ? ironapeChargePose(1 - (f.air.cast.next - time) / 3)
              : !this.motionReduced && !death && f.qiSkill && f.windup
                ? rangedPose(
                    "arhat",
                    Math.max(
                      0,
                      Math.min(
                        0.39,
                        (1 - (f.windup.until - time) / ARHAT_QI.windup) * 0.39,
                      ),
                    ),
                    true,
                    true,
                  )
                : !this.motionReduced && !death && f.bird?.draw
                  ? rangedPose(
                      "birdrider",
                      Math.max(
                        0,
                        Math.min(
                          0.29,
                          (1 - (f.bird.draw.until - time) / 2) * 0.29,
                        ),
                      ),
                      true,
                    )
                  : !this.motionReduced &&
                      !death &&
                      attack &&
                      f.hawkForm?.active
                    ? hawkGroundPose(attack.progress, attack.event.strike ?? 1)
                    : !this.motionReduced &&
                        !death &&
                        attack &&
                        isMelee(f.defId, version)
                      ? meleePose(
                          f.defId,
                          attack.progress,
                          attack.event.skill ||
                            !!attack.event.empowered ||
                            attack.event.gale === 10,
                        )
                      : !this.motionReduced &&
                          !death &&
                          attack &&
                          isRanged(f.defId, version)
                        ? rangedPose(
                            f.defId,
                            attack.progress,
                            attack.event.skill || !!attack.event.empowered,
                            !!f.qiSkill,
                            !!f.gospelAura,
                            !!f.storm,
                          )
                        : REST_POSE;
    const origin = transformation?.moving
      ? project(transformation.from.x + 0.5, transformation.from.y + 0.5)
      : attack
        ? project(attack.event.from.x + 0.5, attack.event.from.y + 0.5)
        : p;
    const destination = transformation?.moving
      ? project(transformation.to.x + 0.5, transformation.to.y + 0.5)
      : secretTarget
        ? project(secretTarget.x+0.5,secretTarget.y+0.5)
      : throwCast || throwBlade
        ? project((throwCast??throwBlade)!.to.x+0.5,(throwCast??throwBlade)!.to.y+0.5)
      : attack
        ? project(attack.event.to.x + 0.5, attack.event.to.y + 0.5)
        : p;
    const dx = destination.x - origin.x,
      dy = destination.y - origin.y,
      length = Math.hypot(dx, dy) || 1;
    const facing =
      (attack || transformation || throwCast || throwBlade || secretTarget) && Math.abs(dx) > 1
        ? Math.sign(dx)
        : f.side === 0
          ? 1
          : -1;

    c.translate(
      (dx / length) * pose.forward * scale,
      (dy / length) * pose.forward * scale -
        pose.lift * scale -
        knockupLift(f, time, this.motionReduced) * scale -
        sway -
        (f.air?.flying
          ? 7 + (this.motionReduced ? 0 : Math.sin(now * 0.002 + f.uid) * 3)
          : 0),
    );
    c.rotate(facing * pose.rotation + (this.motionReduced ? 0 : death * 1.3));
    c.scale(facing * pose.scaleX, pose.scaleY);
    c.globalAlpha *= pose.alpha * (f.signature?.concealed ? 0.55 : 1);
    const drawSprite = (
      sprite: HTMLCanvasElement,
      alpha: number,
      enlarge = 1,
    ) => {
      c.save();
      c.globalAlpha *= alpha;
      const size = 130 * scale * (SPRITE_SCALES[spriteId] ?? SPRITE_SCALES[f.defId] ?? 1) * enlarge,
        w = (size * sprite.width) / Math.max(sprite.width, sprite.height),
        h = (size * sprite.height) / Math.max(sprite.width, sprite.height);
      if (hit) {
        c.shadowColor = "#f5d4ac";
        c.shadowBlur = 15;
      }
      if (pose.trail > 0) {
        c.save();
        c.globalAlpha *= pose.trail * 0.24;
        c.drawImage(sprite, -w / 2 - 14, -h + 4, w, h);
        c.drawImage(sprite, -w / 2 - 28, -h + 4, w, h);
        c.restore();
      }
      c.drawImage(sprite, -w / 2, -h + 4, w, h);
      c.restore();
    };
    if (im) {
      const blend = transformed && transformation ? transformation.alpha : 0;
      drawSprite(im, 1 - blend);
      if (blend && transformed) drawSprite(transformed, blend, 1.15);
    } else {
      c.fillStyle = d.color;
      c.font = "35px serif";
      c.textAlign = "center";
      c.fillText(d.glyph, 0, -18);
    }
    c.restore();
    if (
      !transformation &&
      !this.motionReduced &&
      !death &&
      attack &&
      f.air?.cast?.kind !== "ironape" &&
      !wushiActive(f,time) &&
      isMelee(f.defId, version)
    ) {
      c.save();
      c.scale(facing, 1);
      drawMeleeWeapon(
        c,
        f.defId,
        attack.progress,
        scale,
        attack.event.skill || attack.event.gale === 10,
      );
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
      drawStatuses(c, f, time, scale, this.motionReduced, {
        compact: true,
        ...(f.uid === (this.pinnedFighter ?? this.hoverFighter)
          ? {
              onLabels: (labels: string[]) =>
                this.showInspection(f, time, labels),
            }
          : {}),
      });
      const top = -129 * scale;
      c.fillStyle = "#07130ede";
      c.fillRect(-27, top, 54, 7);
      const soul = f.immortal?.spent && f.hp > 0;
      c.fillStyle = soul ? "#b8ffe4" : color;
      c.fillRect(
        -26,
        top + 1,
        52 *
          Math.max(
            0,
            soul
              ? (f.immortal!.until - time) / f.immortal!.duration
              : f.hp / f.maxHp,
          ),
        5,
      );
      c.fillStyle = "#0c2028";
      c.fillRect(-26, top + 8, 52, 3);
      const gauge = skillGauge(f);
      c.fillStyle = gauge.color;
      c.fillRect(-26, top + 8, 52 * gauge.progress, 3);
      c.font = "bold 10px sans-serif";
      c.textAlign = "center";
      c.fillStyle = "#ffe4a1";
      c.fillText(
        soul
          ? `不朽 ${Math.max(0, (f.immortal!.until - time) / 4).toFixed(1)}s`
          : f.summon
            ? "召唤物"
            : "★".repeat(f.star),
        0,
        top - 5,
      );
      c.font = "11px sans-serif";
      c.strokeStyle = "#0d1816";
      c.lineWidth = 3;
      const name =
        transformation && transformation.alpha > 0.5
          ? "牛魔 · 巨牛形态"
          : fighterName(f);
      c.strokeText(name, 0, 22);
      c.fillStyle = "#f1ecd6";
      c.fillText(name, 0, 22);
      if (f.charm && f.charm.until > time) {
        const label = `魅惑 ${((f.charm.until - time) / 4).toFixed(1)}s`;
        c.strokeText(label, 0, 36);
        c.fillStyle = "#e5b0ff";
        c.fillText(label, 0, 36);
      }
    }
    c.restore();
  }
}
