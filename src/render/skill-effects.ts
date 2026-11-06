import { compactBattleLabels } from "./battle-inspection";
import { drawJungleEffect } from "./jungle";
import { drawWushiEffect, wushiLabels } from "./wushi";
import { shurikenLabels } from "./shuriken";
import { secretOrbLabels } from "./secret-orb";
import { drawBombardmentEffect, bombardmentLabels } from "./bombardment";
import { drawTerminatorEffect, terminatorLabels } from "./terminator";
import { drawWarcryEffect, drawWarcryStatus, warcryLabels } from "./warcry";
import { petrified } from "../engine/warcry";
import { tornadoLabels } from "./tornado";
import { shieldWaveCells } from "../engine/shieldthrall";
import { acidCells, corrosionArmor } from "../engine/beasts";
import { deathSongCells } from "../engine/lingjiu";
import { AURORA, ARHAT_QI, STAFF_GALE, GOSPEL } from "../data/skills";
import { commandBonuses } from "../engine/ironrooster";
import { flameCells } from "../engine/infantry-skills";
import { isPhoenixEgg, phoenixFlameCells } from "../engine/phoenix";
import { carapaceArmor, usesEnergy } from "../engine/triggers";
import type { CombatEffect, Fighter } from "../engine/types";
import { project } from "./projection";

export function drawSkillEffect(
  c: CanvasRenderingContext2D,
  e: CombatEffect,
  age: number,
  reducedMotion = false,
) {
  if (drawWarcryEffect(c,e,age,reducedMotion)) return;
  if (drawTerminatorEffect(c,e,age,reducedMotion)) return;
  if (drawBombardmentEffect(c,e,age,reducedMotion)) return;
  // The startup marker and delayed landing are drawn from committed spell state.
  if (e.kind === "cast" && ["风魔之刃","秘法球","龙卷风"].includes(e.name)) return;
  if (drawWushiEffect(c,e,age,reducedMotion)) return;
  if (drawJungleEffect(c, e, age, reducedMotion)) return;
  if (e.chainHop !== undefined) {
    age -= e.chainHop * 0.18;
    if (age < 0 || age > 3) return;
    const a = project(e.from.x + 0.5, e.from.y + 0.5);
    const b = project(e.to.x + 0.5, e.to.y + 0.5);
    c.save();
    c.globalAlpha =
      Math.max(0, 1 - age / 3) * Math.max(0.45, 1 - e.chainHop * 0.07);
    c.strokeStyle = reducedMotion ? "#b8e8ff" : "#d6f7ff";
    c.lineWidth = Math.max(1.3, 3.4 - e.chainHop * 0.3);
    c.shadowColor = "#71cfff";
    c.shadowBlur = reducedMotion ? 0 : 14;
    c.beginPath();
    c.moveTo(a.x, a.y - 45);
    for (let i = 1; i <= 9; i++) {
      const t = i / 9;
      const jitter = reducedMotion
        ? 0
        : Math.sin(i * 2.7 + age * 3 + e.chainHop) * 11 * Math.sin(t * Math.PI);
      c.lineTo(
        a.x + (b.x - a.x) * t + jitter * 0.3,
        a.y - 45 + (b.y - a.y) * t + jitter,
      );
    }
    c.stroke();
    c.restore();
    return;
  }
  if (age < 0 || age > 4) return;
  if (e.kind === "tar") {
    const a = project(e.from.x + 0.5, e.from.y + 0.5);
    const b = project(e.to.x + 0.5, e.to.y + 0.5);
    const t = Math.min(1, age / 2);
    c.save();
    c.fillStyle = "#ffc173";
    c.strokeStyle = "#fff0ba";
    c.globalAlpha = Math.max(0, 1 - age / 4);
    c.beginPath();
    c.arc(
      a.x + (b.x - a.x) * t,
      a.y -
        35 +
        (b.y - a.y + 35) * t -
        (reducedMotion ? 0 : Math.sin(t * Math.PI) * 65),
      6,
      0,
      Math.PI * 2,
    );
    c.fill();
    c.stroke();
    c.restore();
    return;
  }
  const p = project(e.to.x + 0.5, e.to.y + 0.5),
    origin = project(e.from.x + 0.5, e.from.y + 0.5);
  const colors = {
    taunt: "#edbc76",
    rebirth: "#ffe5a1",
    transform: "#ffb4a0",
    slow: "#d9ca9b",
    sonic: "#c9a9ff",
    burn: "#ffb365",
    flame: "#ffad68",
    grenade: "#c9a2ff",
    tar: "#ffc173",
    windup: "#ffe3a2",
    devour: "#c4ed9c",
    reflect: "#d9b4ff",
    energize: "#8effe6",
    drain: "#c9a4ff",
    chain: "#b8e8ff",
    immortal: "#b8ffe4",
    cast: "#ffe0a0",
    pulse: "#9adfff",
    heal: "#84ffc1",
    shield: "#9edfff",
    stun: "#ffe89a",
    haste: "#ffbf72",
    break: "#ff9d8c",
    teleport: "#b89fff",
    knockback: "#c8efff",
    fortify: "#b9d891",
    cleanse: "#a2ffe1",
    silence: "#d3a2ff",
  };
  if (reducedMotion) {
    c.save();
    c.fillStyle = e.name === "焦油引爆" ? "#ffbc63" : colors[e.kind];
    c.font = "bold 13px sans-serif";
    c.textAlign = "center";
    c.fillText(
      e.kind === "heal" ? `+${e.amount}` : e.name,
      p.x,
      p.y - (e.kind === "cast" ? 100 : 78),
    );
    c.restore();
    return;
  }
  c.save();
  c.globalAlpha = Math.max(0, 1 - age / 4);
  c.strokeStyle = e.name === "焦油引爆" ? "#ffbc63" : colors[e.kind];
  c.fillStyle = e.name === "焦油引爆" ? "#ffbc63" : colors[e.kind];
  c.lineWidth = 2;
  c.shadowColor = e.name === "焦油引爆" ? "#ffbc63" : colors[e.kind];
  c.shadowBlur = 12;
  if (e.kind === "pulse" && e.name === ARHAT_QI.name) {
    c.strokeStyle = "#8cecff";
    c.shadowColor = "#5ad6ff";
    c.shadowBlur = 20;
    const dx = p.x - origin.x,
      dy = p.y - origin.y;
    for (let i = 0; i < 3; i++) {
      const t = Math.min(1, Math.max(0, (age - i * 0.22) / 1.8));
      if (t <= 0) continue;
      c.globalAlpha = Math.max(0, 1 - age / 4) * (1 - i * 0.2);
      c.lineWidth = 4 - i;
      c.beginPath();
      c.ellipse(
        origin.x + dx * t,
        origin.y - 50 + dy * t,
        8 + t * 18,
        12 + t * 22,
        Math.atan2(dy, dx),
        -1.25,
        1.25,
      );
      c.stroke();
    }
  } else if (e.kind === "pulse" && e.name === AURORA.name) {
    const start = { x: origin.x, y: origin.y - 55 };
    const end = { x: p.x, y: p.y - 40 };
    c.strokeStyle = "#83efff";
    c.shadowColor = "#49caff";
    c.shadowBlur = 20;
    for (let strand = -1; strand <= 1; strand++) {
      c.lineWidth = strand === 0 ? 5 : 1.5;
      c.beginPath();
      c.moveTo(start.x, start.y);
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const bend =
          Math.sin(i * 2.3 + age * 4 + strand) * 9 * Math.sin(t * Math.PI);
        c.lineTo(
          start.x + (end.x - start.x) * t + bend * 0.35,
          start.y + (end.y - start.y) * t + bend + strand * 5,
        );
      }
      c.stroke();
    }
    c.strokeStyle = "#e8ffff";
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(end.x, end.y, 10 + age * 10, 16 + age * 12, 0, 0, Math.PI * 2);
    c.stroke();
  } else if (e.kind === "haste" && e.name === "极光增幅") {
    c.strokeStyle = "#83efff";
    c.fillStyle = "#d0fbff";
    c.beginPath();
    c.ellipse(p.x, p.y - 25, 22 + age * 8, 8 + age * 3, 0, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < e.amount / 25; i++) {
      c.beginPath();
      c.arc(p.x - 12 + i * 12, p.y - 80 - age * 5, 3, 0, Math.PI * 2);
      c.fill();
    }
  } else if (e.kind === "pulse" && e.name === "死魂曲") {
    c.strokeStyle = "#d6b2f5";
    c.fillStyle = "#d6b2f5";
    for (const cell of deathSongCells(e.from)) {
      const center = project(cell.x + 0.5, cell.y + 0.5);
      c.globalAlpha = Math.max(0, 1 - age / 4) * 0.13;
      c.beginPath();
      c.ellipse(center.x, center.y, 24, 8, 0, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 3; i++) {
      const progress = (age - i * 0.5) / 3;
      if (progress <= 0 || progress >= 1) continue;
      c.globalAlpha = (1 - progress) * 0.85;
      c.lineWidth = 3 - progress;
      c.beginPath();
      c.ellipse(
        origin.x,
        origin.y - 20,
        18 + progress * 95,
        8 + progress * 32,
        0,
        0,
        Math.PI * 2,
      );
      c.stroke();
    }
  } else if (e.kind === "pulse" && e.name === "酸性污染") {
    c.strokeStyle = "#bcf181";
    c.fillStyle = "#bcf181";
    const progress = Math.min(1, age / 1.4);
    const x = origin.x + (p.x - origin.x) * progress;
    const y =
      origin.y -
      48 +
      (p.y - origin.y) * progress -
      Math.sin(progress * Math.PI) * 35;
    if (progress < 1) {
      c.beginPath();
      c.ellipse(
        x,
        y,
        8,
        5,
        Math.atan2(p.y - origin.y, p.x - origin.x),
        0,
        Math.PI * 2,
      );
      c.fill();
    }
    for (const cell of acidCells(e.to)) {
      const center = project(cell.x + 0.5, cell.y + 0.5);
      c.globalAlpha = Math.max(0, 1 - age / 4) * 0.36;
      c.beginPath();
      c.ellipse(center.x, center.y, 22 + age * 3, 7 + age, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  } else if (
    e.name === "遁地" &&
    (e.kind === "teleport" || e.kind === "pulse")
  ) {
    c.strokeStyle = "#d6b37c";
    c.fillStyle = "#bc965d";
    c.lineWidth = 3;
    if (e.kind === "teleport") {
      c.setLineDash([7, 5]);
      c.beginPath();
      c.moveTo(origin.x, origin.y);
      c.lineTo(p.x, p.y);
      c.stroke();
      c.setLineDash([]);
    }
    for (const at of e.kind === "teleport" ? [origin, p] : [p]) {
      c.beginPath();
      c.ellipse(at.x, at.y, 18 + age * 9, 6 + age * 4, 0, 0, Math.PI * 2);
      c.stroke();
      for (let i = 0; i < 5; i++) {
        const x = at.x + Math.cos(i * 1.3) * (14 + age * 8);
        const y =
          at.y - Math.sin((age / 4) * Math.PI) * 22 + Math.sin(i * 1.3) * 5;
        c.fillRect(x, y, 4, 3);
      }
    }
  } else if (e.kind === "pulse" && e.name === "獠牙冲") {
    c.strokeStyle = "#ffe2a1";
    c.lineWidth = 4;
    for (const offset of [-9, 9]) {
      c.beginPath();
      c.arc(p.x + offset, p.y - 35 - age * 12, 15 + age * 3, -1.8, 0.4);
      c.stroke();
    }
    c.beginPath();
    c.ellipse(p.x, p.y, 23 + age * 9, 7 + age * 3, 0, 0, Math.PI * 2);
    c.stroke();
  } else if (e.kind === "pulse" && e.name === "正义冲锋") {
    c.fillStyle = "#8cf0cc";
    c.strokeStyle = "#8cf0cc";
    for (const cell of shieldWaveCells(e.from, e.to)) {
      const points = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ].map(([dx, dy]) => project(cell.x + dx, cell.y + dy));
      c.globalAlpha = Math.max(0, 1 - age / 4) * 0.14;
      c.beginPath();
      c.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) c.lineTo(point.x, point.y);
      c.closePath();
      c.fill();
      c.stroke();
    }
    const dx = e.to.x - e.from.x,
      dy = e.to.y - e.from.y,
      length = Math.hypot(dx, dy) || 1;
    const ux = dx / length,
      uy = dy / length,
      advance = 0.6 + Math.min(1, age / 3) * 2.9;
    const a = project(
      e.from.x + 0.5 + ux * advance - uy * 1.45,
      e.from.y + 0.5 + uy * advance + ux * 1.45,
    );
    const b = project(
      e.from.x + 0.5 + ux * advance + uy * 1.45,
      e.from.y + 0.5 + uy * advance - ux * 1.45,
    );
    c.globalAlpha = Math.max(0, 1 - age / 4);
    c.strokeStyle = "#b4ffe3";
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(a.x, a.y - 32);
    c.lineTo(b.x, b.y - 32);
    c.stroke();
  } else if (e.kind === "pulse" && e.name === "狂舞花绽") {
    c.strokeStyle = "#a9eadc";
    c.lineWidth = 3;
    for (let i = 0; i < 2; i++) {
      c.beginPath();
      c.ellipse(
        p.x,
        p.y - 24,
        55 + age * 14,
        20 + age * 5,
        0,
        age * 2 + i * Math.PI,
        age * 2 + i * Math.PI + 2.2,
      );
      c.stroke();
    }
  } else if (e.kind === "pulse" && e.name === "飞斧") {
    const t = Math.min(1, age / 2);
    const x = origin.x + (p.x - origin.x) * t;
    const y = origin.y - 65 + (p.y - origin.y) * t - Math.sin(t * Math.PI) * 22;
    c.strokeStyle = "#79e3cb";
    c.fillStyle = "#b5ffe8";
    c.shadowColor = "#79e3cb";
    c.translate(x, y);
    if (age < 2) {
      c.rotate(age * Math.PI * 2);
      c.fillRect(-2, -19, 4, 38);
      c.lineWidth = 5;
      c.beginPath();
      c.arc(0, -9, 17, -2.2, 1.1);
      c.stroke();
    } else {
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, 12 + (age - 2) * 17, 0, Math.PI * 2);
      c.stroke();
    }
  } else if (e.kind === "flame" || e.kind === "grenade") {
    const cells =
      e.kind === "flame"
        ? flameCells(e.from, e.to)
        : Array.from({ length: 9 }, (_, i) => ({
            x: e.to.x + (i % 3) - 1,
            y: e.to.y + Math.floor(i / 3) - 1,
          })).filter((p) => p.x >= 0 && p.x < 8 && p.y >= 0 && p.y < 8);
    c.lineWidth = 2;
    for (const cell of cells) {
      const corners = [
        project(cell.x, cell.y),
        project(cell.x + 1, cell.y),
        project(cell.x + 1, cell.y + 1),
        project(cell.x, cell.y + 1),
      ];
      c.beginPath();
      corners.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      c.stroke();
      const at = project(cell.x + 0.5, cell.y + 0.5);
      c.beginPath();
      c.ellipse(
        at.x,
        at.y - age * 4,
        8 + age * 8,
        5 + age * 3,
        0,
        0,
        Math.PI * 2,
      );
      c.stroke();
    }
  } else if (e.kind === "burn") {
    for (let i = 0; i < 4; i++) {
      const x = p.x + Math.sin(i * 2 + age) * 12,
        y = p.y - 20 - age * 13 - i * 6;
      c.beginPath();
      c.moveTo(x - 6, y);
      c.quadraticCurveTo(x - 8, y - 15, x + 3, y - 25);
      c.quadraticCurveTo(x + 11, y - 5, x + 6, y);
      c.fill();
    }
  } else if (e.kind === "rebirth") {
    const r = 20 + age * 22;
    c.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.ellipse(p.x, p.y - 10 - i * 18, r - i * 5, r * 0.35, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.font = "bold 16px sans-serif";
    c.textAlign = "center";
    c.fillText(e.name, p.x, p.y - 105 - age * 6);
  } else if (e.kind === "pulse" && e.name === "定点狙击") {
    c.strokeStyle = "#a6e8ef";
    c.lineWidth = Math.max(1, 5 - age * 2);
    c.beginPath();
    c.moveTo(origin.x, origin.y - 40);
    c.lineTo(p.x, p.y - 40);
    c.stroke();
    const r = 10 + age * 12;
    c.beginPath();
    c.arc(p.x, p.y - 40, r, 0, Math.PI * 2);
    c.moveTo(p.x - r - 8, p.y - 40);
    c.lineTo(p.x + r + 8, p.y - 40);
    c.moveTo(p.x, p.y - 40 - r - 8);
    c.lineTo(p.x, p.y - 40 + r + 8);
    c.stroke();
  } else if (e.kind === "pulse" && e.name === "虚空潮汐") {
    drawWhaleVortex(c, e.to, age);
  } else if (e.kind === "pulse" && e.name === "不死烈焰") {
    drawPhoenixArea(c, e.from, e.to, age, true);
  } else if (e.kind === "transform") {
    const radius = 18 + age * 18;
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 + age * 0.3;
      c.beginPath();
      c.moveTo(
        p.x + Math.cos(angle) * radius,
        p.y - 35 + Math.sin(angle) * radius * 0.5,
      );
      c.lineTo(
        p.x + Math.cos(angle) * radius * 1.25,
        p.y - 55 + Math.sin(angle) * radius * 0.5,
      );
      c.stroke();
    }
    c.font = "bold 15px sans-serif";
    c.textAlign = "center";
    c.fillText("血羽化身", p.x, p.y - 105 - age * 3);
  } else if (
    e.kind === "sonic" ||
    e.kind === "slow" ||
    (e.kind === "cast" && e.name === "游龙卷风")
  ) {
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      const r = 10 + i * 8 + age * 9;
      c.ellipse(
        p.x + (e.name === "游龙卷风" ? Math.sin(age * 4 + i) * 7 : 0),
        p.y - i * 17 - 8,
        r,
        r * 0.35,
        0,
        age + i,
        age + i + Math.PI * 1.65,
      );
      c.stroke();
    }
  } else if (e.kind === "windup") {
    if (e.name === "晶核蓄力") {
      c.strokeStyle = "#8cecff";
      c.shadowColor = "#5ad6ff";
    }
    c.setLineDash([4, 6]);
    c.beginPath();
    c.moveTo(origin.x, origin.y - 45);
    c.lineTo(p.x, p.y - 45);
    c.stroke();
    c.setLineDash([]);
    c.beginPath();
    c.arc(p.x, p.y - 45, 24 - age * 3, 0, Math.PI * 2);
    c.stroke();
  } else if (e.kind === "devour") {
    if (e.name === "饕餮") {
      // A tether and inward motes show consumption, without erasing death/rebirth rules.
      c.strokeStyle = "#d8d69b";
      c.lineWidth = 4 * Math.max(0.2, 1 - age / 4);
      c.beginPath();
      c.moveTo(origin.x, origin.y - 55);
      c.lineTo(p.x, p.y - 40);
      c.stroke();
      for (let i = 0; i < 3; i++) {
        const u = Math.min(1, age / 4 + i * 0.1);
        c.beginPath();
        c.arc(
          p.x + (origin.x - p.x) * u,
          p.y - 40 + (origin.y - p.y - 15) * u,
          3,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    }
    const spread = 18 + Math.sin((age / 4) * Math.PI) * 24;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(p.x - 28, p.y - 40 + side * spread);
      for (let i = 0; i < 6; i++)
        c.lineTo(p.x - 28 + i * 11, p.y - 40 + side * (spread - (i % 2) * 13));
      c.stroke();
    }
    c.font = "bold 15px sans-serif";
    c.textAlign = "center";
    c.fillText("吞噬", p.x, p.y - 105);
  } else if (["reflect", "energize", "drain", "chain"].includes(e.kind)) {
    const start = { x: origin.x, y: origin.y - 45 },
      end = { x: p.x, y: p.y - 45 };
    c.beginPath();
    c.moveTo(start.x, start.y);
    for (let i = 1; i <= 8; i++) {
      const u = i / 8;
      c.lineTo(
        start.x + (end.x - start.x) * u,
        start.y +
          (end.y - start.y) * u +
          (i < 8
            ? Math.sin(i * 2.7 + age * 4) * (e.kind === "chain" ? 14 : 5)
            : 0),
      );
    }
    c.lineWidth = e.kind === "chain" ? 3 : 1.5;
    c.stroke();
    if (e.kind !== "chain") {
      c.font = "bold 12px sans-serif";
      c.textAlign = "center";
      c.fillText(
        e.kind === "energize" ? "+" + Math.round(e.amount) + " 能量" : e.kind === "drain" ? "−" + Math.round(e.amount) + " 能量" : "反伤",
        p.x,
        p.y - 90 - age * 6,
      );
    }
  } else if (e.kind === "cast" && e.name === "雷电法球") {
    const radius = 22 + age * 23;
    c.strokeStyle = "#c5a6ff";
    c.lineWidth = 3;
    for (let i = 0; i < 2; i++) {
      c.beginPath();
      c.ellipse(
        p.x,
        p.y - 15,
        radius,
        radius * (0.4 + i * 0.3),
        age * 0.25,
        0,
        Math.PI * 2,
      );
      c.stroke();
    }
    c.font = "bold 14px sans-serif";
    c.textAlign = "center";
    c.fillText(e.name, p.x, p.y - 100 - age * 4);
  } else if (e.kind === "immortal") {
    c.strokeStyle = "#b8ffe4";
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.ellipse(
        p.x,
        p.y - 20 - age * 12 - i * 18,
        20 + age * 12,
        7 + age * 3,
        0,
        0,
        Math.PI * 2,
      );
      c.stroke();
    }
    c.font = "bold 15px sans-serif";
    c.textAlign = "center";
    c.fillText(e.name, p.x, p.y - 100 - age * 5);
  } else if (
    e.kind === "cast" &&
    ["枯藤缠身", "古木震荡", "冥霜吐息"].includes(e.name)
  ) {
    c.strokeStyle = e.name === "冥霜吐息" ? "#b3ffe9" : "#c6d894";
    c.lineWidth = 3;
    if (e.name === "枯藤缠身") {
      for (const direction of [-1, 1]) {
        c.beginPath();
        c.moveTo(origin.x, origin.y - 30);
        c.quadraticCurveTo(
          (origin.x + p.x) / 2 + direction * 40,
          Math.min(origin.y, p.y) - 80,
          p.x,
          p.y - 30,
        );
        c.stroke();
      }
    } else if (e.name === "冥霜吐息") {
      c.lineWidth = 15 * Math.max(0.1, 1 - age / 4);
      c.beginPath();
      c.moveTo(origin.x, origin.y - 50);
      c.lineTo(p.x, p.y - 30);
      c.stroke();
    }
    const center = e.name === "古木震荡" ? origin : p;
    const radius = e.name === "古木震荡" ? 35 + age * 22 : 20 + age * 10;
    c.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      c.beginPath();
      c.moveTo(center.x, center.y);
      c.lineTo(
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius * 0.45,
      );
      c.lineTo(
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius * 0.45 - 25,
      );
      c.stroke();
    }
    c.font = "bold 15px sans-serif";
    c.textAlign = "center";
    c.fillText(e.name, center.x, center.y - 95 - age * 5);
  } else if (e.kind === "pulse") {
    if (e.name === "虚空光束") {
      const dx = e.to.x - e.from.x,
        dy = e.to.y - e.from.y;
      const reach = Math.min(
        ...[
          dx > 0
            ? (7.5 - e.from.x) / dx
            : dx < 0
              ? (-0.5 - e.from.x) / dx
              : Infinity,
          dy > 0
            ? (7.5 - e.from.y) / dy
            : dy < 0
              ? (-0.5 - e.from.y) / dy
              : Infinity,
        ],
      );
      const end = project(
        e.from.x + 0.5 + dx * reach,
        e.from.y + 0.5 + dy * reach,
      );
      for (const width of [22, 9, 3]) {
        c.lineWidth = width;
        c.globalAlpha = (1 - age / 4) * (width === 22 ? 0.25 : 0.85);
        c.beginPath();
        c.moveTo(origin.x, origin.y - 35);
        c.lineTo(end.x, end.y - 35);
        c.stroke();
      }
    } else {
      c.strokeStyle = ["轰炸脉冲", "震荡压制", "重装震爆"].includes(e.name)
        ? "#ffbd76"
        : "#b2baff";
      const radius = 25 + age * 30;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse(
          p.x,
          p.y - 10,
          radius + i * 13,
          (radius + i * 13) * 0.45,
          0,
          0,
          Math.PI * 2,
        );
        c.stroke();
      }
      if (e.name === "重装震爆") {
        // Twin impacts and radial fragments distinguish a single heavy slam.
        for (const offset of [-22, 22]) {
          c.fillStyle = "#ffe1ac";
          c.globalAlpha *= 0.8;
          c.fillRect(p.x + offset - 8, p.y - 24 - age * 7, 16, 11);
        }
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          c.beginPath();
          c.moveTo(p.x + Math.cos(angle) * 20, p.y + Math.sin(angle) * 9);
          c.lineTo(
            p.x + Math.cos(angle) * radius,
            p.y + Math.sin(angle) * radius * 0.45 - age * 6,
          );
          c.stroke();
        }
      }
      if (e.name === "雷霆脉冲") {
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(p.x + 14, p.y - 115);
        c.lineTo(p.x - 10, p.y - 63);
        c.lineTo(p.x + 8, p.y - 63);
        c.lineTo(p.x - 6, p.y - 15);
        c.stroke();
      }
    }
  } else if (e.kind === "cast") {
    if (e.name.includes("殉爆")) {
      c.fillStyle = "#ff9e4d";
      c.strokeStyle = "#ffe8b5";
      const radius = 18 + age * 38;
      c.globalAlpha *= 0.65;
      c.beginPath();
      c.ellipse(
        origin.x,
        origin.y - 14,
        radius,
        radius * 0.6,
        0,
        0,
        Math.PI * 2,
      );
      c.fill();
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5;
        c.beginPath();
        c.moveTo(origin.x, origin.y - 14);
        c.lineTo(
          origin.x + Math.cos(angle) * radius * 1.3,
          origin.y - 14 + Math.sin(angle) * radius * 0.8,
        );
        c.stroke();
      }
    } else if (e.name === "魅惑") {
      c.strokeStyle = "#d59aff";
      c.fillStyle = "#eed2ff";
      c.setLineDash([5, 5]);
      c.beginPath();
      c.moveTo(origin.x, origin.y - 35);
      c.lineTo(p.x, p.y - 35);
      c.stroke();
      c.setLineDash([]);
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse(
          p.x,
          p.y - 45 - i * 12,
          12 + age * 8,
          5,
          age * 0.4,
          0,
          Math.PI * 2,
        );
        c.stroke();
      }
    } else if (e.name === "蜂群震荡") {
      c.strokeStyle = "#ffe288";
      for (let i = 0; i < 3; i++) {
        const r = 20 + age * 22 + i * 16;
        c.beginPath();
        c.ellipse(origin.x, origin.y - 15, r, r * 0.45, 0, 0, Math.PI * 2);
        c.stroke();
      }
    }
    const radius = 24 + Math.min(2, e.amount) * 22 + age * 13;
    c.beginPath();
    c.ellipse(origin.x, origin.y, radius, radius * 0.35, 0, 0, Math.PI * 2);
    c.stroke();
    c.font = "bold 17px sans-serif";
    c.textAlign = "center";
    c.fillText(e.name, origin.x, origin.y - 100 - age * 7);
  } else if (e.kind === "fortify" && e.name === "战术协同") {
    c.strokeStyle = "#efcb85";
    c.beginPath();
    c.moveTo(origin.x, origin.y - 45);
    c.lineTo(p.x, p.y - 45);
    c.stroke();
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 - Math.PI / 2;
      const x = p.x + Math.cos(angle) * (16 + age * 3);
      const y = p.y - 55 + Math.sin(angle) * (22 + age * 3);
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.closePath();
    c.stroke();
  } else if (e.kind === "heal" || e.kind === "shield") {
    c.beginPath();
    c.ellipse(p.x, p.y - 35, 20 + age * 3, 40, 0, 0, Math.PI * 2);
    c.stroke();
    c.font = "bold 16px sans-serif";
    c.textAlign = "center";
    c.fillText(
      `${e.kind === "heal" ? "+" : "护盾 +"}${e.amount}`,
      p.x,
      p.y - 65 - age * 9,
    );
    if (e.kind === "heal")
      for (let i = 0; i < 3; i++) {
        const x = p.x + (i - 1) * 18,
          y = p.y - 15 - age * 16 - i * 8;
        c.fillRect(x - 4, y - 1, 8, 2);
        c.fillRect(x - 1, y - 4, 2, 8);
      }
  } else if (e.kind === "teleport" || e.kind === "knockback") {
    c.setLineDash([4, 7]);
    c.beginPath();
    c.moveTo(origin.x, origin.y - 25);
    c.lineTo(p.x, p.y - 25);
    c.stroke();
    for (const at of [origin, p]) {
      c.beginPath();
      c.ellipse(at.x, at.y, 16 + age * 13, 6 + age * 5, 0, 0, Math.PI * 2);
      c.stroke();
    }
  } else {
    c.font = "bold 13px sans-serif";
    c.textAlign = "center";
    c.fillText(e.name, p.x, p.y - 90 - age * 8);
  }
  c.restore();
}

/** Draw in unit-local coordinates, outside the sprite recoil transform. */
export function drawStatuses(
  c: CanvasRenderingContext2D,
  f: Fighter,
  time: number,
  scale: number,
  reducedMotion = false,
  presentation?: { compact?: boolean; onLabels?: (labels: string[]) => void },
) {
  c.save();
  drawWarcryStatus(c,f,time,scale);
  if (f.immortal?.spent && f.hp > 0) {
    c.strokeStyle = "#b8ffe4";
    c.lineWidth = 2;
    c.shadowColor = "#9affdd";
    c.shadowBlur = reducedMotion ? 0 : 12;
    c.beginPath();
    c.ellipse(0, -48 * scale, 40 * scale, 58 * scale, 0, 0, Math.PI * 2);
    c.stroke();
    c.shadowBlur = 0;
  }
  if (f.shield > 0) {
    c.strokeStyle = "#9cdfff99";
    c.fillStyle = "#74cfff0d";
    c.lineWidth = 2;
    c.shadowColor = "#8edbff";
    c.shadowBlur = 8;
    c.beginPath();
    c.ellipse(0, -53 * scale, 43 * scale, 61 * scale, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.shadowBlur = 0;
    const top = -129 * scale;
    c.fillStyle = "#90ddff";
    c.fillRect(-26, top - 4, 52 * Math.min(1, f.shield / f.maxHp), 2);
  }
  const labels: string[] = [];
  if (f.air?.flying && f.air.evasion)
    labels.push(`空军闪避 ${Math.round(f.air.evasion * 100)}%`);
  if (f.air?.flying && f.air.groundBonus)
    labels.push(`猛禽对地普攻 +${Math.round(f.air.groundBonus * 100)}%`);
  if (f.groundBonus)
    labels.push(`对地普攻 +${Math.round(f.groundBonus * 100)}%`);
  if (f.damageManaBonus && usesEnergy(f))
    labels.push(`召唤命中回能 +${Math.round(f.damageManaBonus * 100)}%`);
  if (f.air?.siege)
    labels.push(
      `攻城${f.air.siegeDirect ? "直接伤害" : "普攻"} +${Math.round(f.air.siege * 100)}%`,
    );
  if (f.trueAttack) labels.push("陆行者 · 普攻真实伤害");
  if (f.supportHeal)
    labels.push(`支援阵亡 · 治疗${f.supportHeal} / 回能${f.supportMana}`);
  if (f.lifesteal)
    labels.push(
      `普攻吸血 ${Math.round(f.lifesteal * 100)}%${f.teamLifesteal ? ` · 异能${Math.round(f.teamLifesteal * 100)}%` : ""}`,
    );
  if (f.armorPenetration) labels.push(`狙击甲穿 +${f.armorPenetration}`);
  if (f.energyPenalty) labels.push(`回能压制 −${f.energyPenalty}`);
  if (f.air?.seaWard && f.air.flying)
    labels.push(`海神法术减伤 +${Math.round(f.air.seaWard * 100)}%`);
  if (f.reflection) labels.push(`灵能反伤 ${f.reflection}`);
  if (f.formationAttack || f.teamAttack)
    labels.push(
      `${(f.formationAttack ?? 0) > (f.teamAttack ?? 0) ? "傀儡" : "全军"}攻击 +${Math.round((f.formationAttack ?? f.teamAttack!) * 100)}%`,
    );
  if (f.formationHaste)
    labels.push(
      `${f.formationHaste > (f.teamHaste ?? 0) ? "野兽" : "全军"}攻速 +${Math.round(f.formationHaste * 100)}%`,
    );
  if (f.bladeCrit) labels.push(`暴击 10% · 已触发${f.bladeCrit.crits}次`);
  if (f.assassinCrit)
    labels.push(
      `刺杀暴击 ${Math.round(f.assassinCrit.chance * 100)}% · 已触发${f.assassinCrit.crits}次`,
    );
  if (f.bladeStorm && f.bladeStorm.until > time) {
    labels.push(
      `狂舞 · 免技能伤害 / 免控 ${((f.bladeStorm.until - time) / 4).toFixed(1)}s`,
    );
    c.strokeStyle = "#a9eadc";
    c.lineWidth = 3;
    for (let i = 0; i < 2; i++) {
      const angle = (reducedMotion ? 0 : time * 2.4) + i * Math.PI;
      c.beginPath();
      c.ellipse(0, -35 * scale, 59 * scale, 25 * scale, 0, angle, angle + 2.5);
      c.stroke();
    }
  }
  if (f.gale) {
    const full = f.gale.stacks === STAFF_GALE.maxStacks;
    labels.push(
      `疾风 ${f.gale.stacks}/${STAFF_GALE.maxStacks} · 攻速+${Math.round(f.gale.stacks * STAFF_GALE.speedPerStack[f.star - 1] * 100)}%${full ? " · 额外护甲+50" : ""}`,
    );
    if (full) {
      c.strokeStyle = "#85c8ff";
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(0, -42 * scale, 43 * scale, 18 * scale, 0, 0, Math.PI * 2);
      c.stroke();
    }
  }
  if (f.bird) {
    labels.push(
      f.bird.draw
        ? `强箭蓄力 ${Math.max(0, (f.bird.draw.until - time) / 4).toFixed(2)}s`
        : f.bird.shots >= 7 - f.star
          ? "强箭就绪"
          : `强箭 ${f.bird.shots}/${7 - f.star}`,
    );
    if (f.bird.draw) {
      c.strokeStyle = "#dceea0";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(
        0,
        -65 * scale,
        (reducedMotion
          ? 20
          : 16 + Math.max(0, 2 - f.bird.draw.until + time) * 7) * scale,
        -1.15,
        1.15,
      );
      c.stroke();
    }
  }
  if (f.aurora) {
    if (f.aurora.stacks)
      labels.push(
        `极光增幅 ${f.aurora.stacks}/${AURORA.maxStacks} · 攻击+${f.aurora.stacks * AURORA.attackPerStack * 100}%`,
      );
    if ((f.skillReadyAt ?? 0) > time)
      labels.push(`极光冷却 ${((f.skillReadyAt! - time) / 4).toFixed(1)}s`);
  }
  if (f.qiSkill && (f.skillReadyAt ?? 0) > time)
    labels.push(`气波掌冷却 ${((f.skillReadyAt! - time) / 4).toFixed(1)}s`);
  if (f.jungle) {
    if ((f.skillReadyAt ?? 0) > time)
      labels.push(`丛林冷却 ${((f.skillReadyAt! - time) / 4).toFixed(1)}s`);
    labels.push(`自然恢复 ${f.regeneration * 4} 生命/秒`);
  }
  if (
    [
      "elephant",
      "venombeast",
      "lingjiu",
      "shieldthrall",
      "swordthrall",
      "axethrall",
      "motorcycle",
      "irondog",
      "specialist",
      "ironape",
      "ironrooster",
    ].includes(f.defId) &&
    !f.air?.cast &&
    !(f.bladeStorm && f.bladeStorm.until > time) &&
    (f.skillReadyAt ?? 0) > time
  )
    labels.push(
      `${["pangolin", "lingjiu", "elephant", "venombeast", "shieldthrall", "swordthrall", "axethrall", "irondog", "ironape"].includes(f.defId) ? "回充" : "装填"} ${((f.skillReadyAt! - time) / 4).toFixed(1)}s`,
    );
  if (isPhoenixEgg(f))
    labels.push(
      `涅槃 ${Math.max(0, (f.phoenix!.eggUntil - time) / 4).toFixed(1)}s`,
    );
  else if (f.phoenix?.hatched) labels.push("涅槃已用");
  if (f.hawkForm?.active) labels.push(f.combo ? "地面 · 连击" : "地面形态");
  if (f.windup) {
    labels.push(
      f.qiSkill
        ? `晶核蓄力 ${Math.max(0, (f.windup.until - time) / 4).toFixed(1)}s`
        : "真言蓄力",
    );
    c.strokeStyle = f.qiSkill ? "#8cecff" : "#ffe3a2";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(
      0,
      -45 * scale,
      (reducedMotion
        ? 18
        : 10 + (1 - Math.min(1, (f.windup.until - time) / 4)) * 16) * scale,
      0,
      Math.PI * 2,
    );
    c.stroke();
  }
  if (f.slow && f.slow.until > time) labels.push("攻速降低");
  if (f.sonic?.length) labels.push("声波侵蚀");
  if (f.gospelAura) {
    labels.push(f.charm ? "福音暂停（魅惑）" : `福音 ${GOSPEL.energy[f.star - 1]} 能量/秒`);
    labels.push(`圆形${GOSPEL.radius}格 · 同目标取最高星级`);
    labels.push(`最近供能 ${f.gospelAura.targets.length} 人 · 最多 ${f.gospelAura.peakTargets} 人`);
  }
  if (f.taotie) {
    labels.push(`成功吞噬 ${f.taotie.feasts} 次`);
    if (f.taotie.rage && f.taotie.rage.until > time) {
      labels.push(
        `饕餮狂暴 · 攻击+${f.taotie.rage.attack} · ${((f.taotie.rage.until - time) / 4).toFixed(1)}s`,
      );
      c.strokeStyle = "#edc56c";
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(0, -30 * scale, 29 * scale, 35 * scale, 0, 0, Math.PI * 2);
      c.stroke();
    }
    if ((f.skillReadyAt ?? 0) > time)
      labels.push(`饕餮冷却 ${((f.skillReadyAt! - time) / 4).toFixed(1)}s`);
    labels.push(`自然恢复 ${f.regeneration * 4} 生命/秒`);
  }
  if (f.tar) {
    labels.push(`投弹 ${f.tar.launched}枚 · 引爆 ${f.tar.detonated}枚`);
    if (f.tar.bombs.length) labels.push(`待爆 ${f.tar.bombs.length}枚`);
  }
  if (f.devourSpent) labels.push("吞噬已用");
  if (f.stunUntil > time) {
    labels.push(petrified(f,time) ? `石化 ${((f.petrifyUntil!-time)/4).toFixed(1)}s` : f.knockup && f.knockup.until > time ? "击飞" : "眩晕");
    c.fillStyle = petrified(f,time) ? "#bfc6b0" : "#ffe080";
    for (let i = 0; i < 3; i++) {
      const a = (reducedMotion || petrified(f,time) ? 0 : time * 2) + (i * Math.PI * 2) / 3;
      c.beginPath();
      c.arc(
        Math.cos(a) * 21,
        -105 * scale + Math.sin(a) * 6,
        3,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
  }
  if (f.storm) labels.push(`雷暴发出 ${f.storm.launched}球 · 接触 ${f.storm.hits}次 · 削能 ${Math.round(f.storm.energyRemoved)}`);
  if (f.jungle) labels.push(`丛林波 ${f.jungle.waves}次 · 波及 ${f.jungle.hits}次 · 击飞 ${f.jungle.knockups}次 · 落地眩晕 ${f.jungle.landings}次`);
  labels.push(...wushiLabels(f,time));
  labels.push(...shurikenLabels(f,time));
  labels.push(...secretOrbLabels(f,time));
  labels.push(...bombardmentLabels(f,time));
  labels.push(...terminatorLabels(f,time));
  labels.push(...warcryLabels(f,time));
  labels.push(...tornadoLabels(f,time));
  if(f.taunt && f.taunt.until>time)labels.push(`无式嘲讽 ${((f.taunt.until-time)/4).toFixed(1)}s · 转向武僧`);
  if (f.air?.cast)
    labels.push(
      f.air.cast.kind === "tornado" ? `龙卷蓄风 · ${Math.max(0,(f.air.cast.next-time)/4).toFixed(2)}s` : f.air.cast.kind === "warcry" ? `战吼蓄力 · ${Math.max(0,(f.air.cast.next-time)/4).toFixed(2)}s` : f.air.cast.kind === "terminator" ? `终结者装填 · 余${f.air.cast.remaining}弹 · ${Math.max(0,(f.air.cast.next-time)/4).toFixed(2)}s` : f.air.cast.kind === "bombardment" ? `机群起飞 · ${Math.max(0,(f.air.cast.next-time)/4).toFixed(2)}s` : f.air.cast.kind === "jungle" ? `丛林蓄力 · ${Math.max(0,(f.air.cast.next-time)/4).toFixed(2)}s` : f.air.cast.kind === "storm" ? `雷暴蓄力 · ${Math.max(0,(f.air.cast.next-time)/4).toFixed(2)}s` : f.air.cast.kind === "ark"
        ? "重炮蓄力"
        : f.air.cast.kind === "ironape"
          ? `震爆蓄力 · ${Math.max(0, (f.air.cast.next - time) / 4).toFixed(2)}s`
          : f.air.cast.kind === "specialist"
            ? `锁定 · ${Math.max(0, (f.air.cast.next - time) / 4).toFixed(2)}s`
            : f.air.cast.kind === "irondog"
              ? `震荡 · 余${f.air.cast.remaining}次`
              : f.air.cast.kind === "tar"
                ? `投弹 · 余${f.air.cast.remaining}枚`
                : f.air.cast.kind === "motorcycle"
                  ? `连发 · 余${f.air.cast.remaining}发`
                  : f.air.cast.kind === "medic"
                    ? `治疗 · 余${f.air.cast.remaining}次`
                    : f.air.cast.kind === "whale"
                      ? `潮汐 · 余${f.air.cast.remaining}次`
                      : "持续施法",
    );
  const command = commandBonuses(f, time);
  if (command.attack || command.armor)
    labels.push(
      `协同 +${Math.round(command.attack * 100)}% / 甲+${command.armor}`,
    );
  if (f.attackBoost && f.attackBoost.until > time) labels.push("攻击强化");
  if (f.hasteUntil > time) labels.push("加速");
  if (f.armorBreakUntil > time) labels.push("破甲");
  const corrosion = corrosionArmor(f, time);
  if (corrosion) {
    labels.push(`酸蚀减甲 −${corrosion}`);
    c.strokeStyle = "#b7dc76";
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(0, 4, 30 * scale, 9 * scale, 0, 0, Math.PI * 2);
    c.stroke();
  }
  if (f.armorRegen && f.hp > 0) {
    labels.push(`装甲再生 +${f.armorRegen * 4}/s`);
    if (f.hp < f.maxHp) {
      c.strokeStyle = "#88edc2";
      c.lineWidth = 2;
      c.globalAlpha = reducedMotion ? 0.7 : 0.5 + Math.sin(time * 1.5) * 0.2;
      c.beginPath();
      c.ellipse(0, 8, 27 * scale, 10 * scale, 0, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
    }
  }
  if (f.infantryArmorBreak) labels.push(`步兵减甲 −${f.infantryArmorBreak}`);
  if (f.armorBuffUntil > time) labels.push("护甲强化");
  if (carapaceArmor(f, time) > 0)
    labels.push(`玄甲 +${carapaceArmor(f, time).toFixed(1)}`);
  if (f.signature?.concealed) labels.push("隐蔽");
  if (f.signature && f.defId === "tiger")
    labels.push(
      f.signature.attacks % 4 === 0
        ? "箭雨就绪"
        : `箭雨 ${f.signature.attacks % 4}/4`,
    );
  if (f.manaLockUntil > time) labels.push("封能");
  if ((f.silenceUntil ?? 0) > time) labels.push("沉默");
  if (f.burn?.length) labels.push("灼烧");
  presentation?.onLabels?.(labels);
  const visibleLabels = presentation?.compact
    ? compactBattleLabels(f, time)
    : labels;
  if (visibleLabels.length) {
    c.font = "bold 11px sans-serif";
    c.textAlign = "center";
    c.strokeStyle = "#101c1b";
    c.lineWidth = 3;
    c.strokeText(visibleLabels.join(" · "), 0, 36);
    c.fillStyle = f.stunUntil > time ? "#ffe080" : "#aee5f0";
    c.fillText(visibleLabels.join(" · "), 0, 36);
  }
  c.restore();
}

/** Locked spell area remains visible throughout wind-up/channel; follows replay time. */
export function drawAirTelegraph(
  c: CanvasRenderingContext2D,
  f: Fighter,
  time: number,
  reducedMotion = false,
) {
  const cast = f.air?.cast;
  if (!cast || f.hp <= 0 || ["storm","jungle","bombardment","terminator","warcry","tornado"].includes(cast.kind)) return;
  c.save();
  c.strokeStyle = f.side === 0 ? "#9edaff" : "#ffb590";
  c.fillStyle = f.side === 0 ? "#7ccfff16" : "#ff8c6616";
  if (cast.kind === "medic") {
    c.strokeStyle = "#94ffe2";
    c.fillStyle = "#63e8b52a";
  }
  c.lineWidth = 2;
  c.globalAlpha = reducedMotion ? 0.65 : 0.55 + Math.sin(time * 3) * 0.15;
  c.setLineDash([7, 6]);
  if (cast.kind === "specialist") {
    const a = project(f.x + 0.5, f.y + 0.5),
      b = project(cast.to.x + 0.5, cast.to.y + 0.5);
    c.strokeStyle = "#a6e8ef";
    c.beginPath();
    c.moveTo(a.x, a.y - 40);
    c.lineTo(b.x, b.y - 40);
    c.stroke();
    c.setLineDash([]);
    const r = reducedMotion
      ? 18
      : 12 + Math.min(1, Math.max(0, (cast.next - time) / 3)) * 16;
    c.beginPath();
    c.arc(b.x, b.y - 40, r, 0, Math.PI * 2);
    c.moveTo(b.x - r - 6, b.y - 40);
    c.lineTo(b.x + r + 6, b.y - 40);
    c.moveTo(b.x, b.y - 40 - r - 6);
    c.lineTo(b.x, b.y - 40 + r + 6);
    c.stroke();
  } else if (cast.kind === "motorcycle" || cast.kind === "tar") {
    const p = project(f.x + 0.5, f.y + 0.5);
    c.setLineDash([]);
    c.strokeStyle = "#ffc173";
    c.fillStyle = "#ffc173";
    // Ammo markers, not an AoE footprint: each round selects one target independently.
    for (let i = 0; i < (cast.kind === "tar" ? f.star : 3); i++) {
      const x = p.x - 16 + i * 12;
      c.strokeRect(x, p.y + 8, 8, 14);
      if (i < cast.remaining) c.fillRect(x + 2, p.y + 10, 4, 10);
    }
  } else if (cast.kind === "phoenix") {
    drawPhoenixArea(c, cast.from, cast.to, reducedMotion ? 0 : time, false);
  } else if (cast.kind === "ark") {
    const dx = cast.to.x - cast.from.x,
      dy = cast.to.y - cast.from.y;
    const reach = Math.min(
      dx > 0
        ? (7.5 - cast.from.x) / dx
        : dx < 0
          ? (-0.5 - cast.from.x) / dx
          : Infinity,
      dy > 0
        ? (7.5 - cast.from.y) / dy
        : dy < 0
          ? (-0.5 - cast.from.y) / dy
          : Infinity,
    );
    if (Number.isFinite(reach)) {
      const a = project(cast.from.x + 0.5, cast.from.y + 0.5),
        b = project(
          cast.from.x + 0.5 + dx * reach,
          cast.from.y + 0.5 + dy * reach,
        );
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
  } else {
    const center = ["bomber", "irondog", "ironape"].includes(cast.kind)
      ? f
      : cast.to;
    const radius = cast.kind === "irondog" ? 1 : 2;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        if (Math.abs(x - center.x) + Math.abs(y - center.y) > radius) continue;
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
  }
  if (cast.kind === "whale" && !reducedMotion)
    drawWhaleVortex(c, cast.to, time);
  c.restore();
}

function drawWhaleVortex(
  c: CanvasRenderingContext2D,
  center: { x: number; y: number },
  time: number,
) {
  c.save();
  c.setLineDash([]);
  c.strokeStyle = "#8fe5e1";
  c.lineWidth = 2;
  const p = project(center.x + 0.5, center.y + 0.5);
  for (let arm = 0; arm < 3; arm++) {
    c.beginPath();
    for (let step = 0; step <= 32; step++) {
      const angle = (arm * Math.PI * 2) / 3 + step * 0.18 - time * 0.45;
      const radius = 10 + step * 2.5;
      const x = p.x + Math.cos(angle) * radius,
        y = p.y + Math.sin(angle) * radius * 0.48;
      if (step) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.stroke();
  }
  c.restore();
}

/** Telegraph and pulse share the engine's clipped cell footprint. */
function drawPhoenixArea(
  c: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  time: number,
  pulse: boolean,
) {
  c.save();
  c.strokeStyle = "#ffb663";
  c.fillStyle = pulse ? "#ff9d493b" : "#ffbd7620";
  if (pulse) c.setLineDash([]);
  for (const cell of phoenixFlameCells(from, to)) {
    const corners = [
      project(cell.x, cell.y),
      project(cell.x + 1, cell.y),
      project(cell.x + 1, cell.y + 1),
      project(cell.x, cell.y + 1),
    ];
    c.beginPath();
    corners.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.fill();
    c.stroke();
    if (pulse) {
      const p = project(cell.x + 0.5, cell.y + 0.5),
        h = 18 + Math.sin(time * 3 + cell.x + cell.y) * 9;
      c.fillStyle = "#ffe3a18c";
      c.beginPath();
      c.moveTo(p.x - 7, p.y);
      c.quadraticCurveTo(p.x - 10, p.y - h * 0.7, p.x + 2, p.y - h);
      c.quadraticCurveTo(p.x + 13, p.y - h * 0.3, p.x + 7, p.y);
      c.closePath();
      c.fill();
      c.fillStyle = "#ff9d493b";
    }
  }
  c.restore();
}
