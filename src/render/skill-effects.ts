import { commandBonuses } from "../engine/ironrooster";
import { flameCells } from "../engine/infantry-skills";
import { isPhoenixEgg, phoenixFlameCells } from "../engine/phoenix";
import { carapaceArmor } from "../engine/triggers";
import type { CombatEffect, Fighter } from "../engine/types";
import { project } from "./projection";

export function drawSkillEffect(
  c: CanvasRenderingContext2D,
  e: CombatEffect,
  age: number,
  reducedMotion = false,
) {
  if (age < 0 || age > 4) return;
  const p = project(e.to.x + 0.5, e.to.y + 0.5),
    origin = project(e.from.x + 0.5, e.from.y + 0.5);
  const colors = {
    rebirth: "#ffe5a1",
    transform: "#ffb4a0",
    slow: "#d9ca9b",
    sonic: "#c9a9ff",
    burn: "#ffb365",
    flame: "#ffad68",
    grenade: "#c9a2ff",
    windup: "#ffe3a2",
    devour: "#c4ed9c",
    reflect: "#d9b4ff",
    energize: "#8effe6",
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
    c.fillStyle = colors[e.kind];
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
  c.strokeStyle = colors[e.kind];
  c.fillStyle = colors[e.kind];
  c.lineWidth = 2;
  c.shadowColor = colors[e.kind];
  c.shadowBlur = 12;
  if (e.kind === "pulse" && e.name === "狂舞花绽") {
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
  } else if (["reflect", "energize", "chain"].includes(e.kind)) {
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
        e.kind === "energize" ? "+" + Math.round(e.amount) + " 能量" : "反伤",
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
) {
  c.save();
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
  if (
    [
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
      `${["swordthrall", "axethrall", "irondog", "ironape"].includes(f.defId) ? "回充" : "装填"} ${((f.skillReadyAt! - time) / 4).toFixed(1)}s`,
    );
  if (isPhoenixEgg(f))
    labels.push(
      `涅槃 ${Math.max(0, (f.phoenix!.eggUntil - time) / 4).toFixed(1)}s`,
    );
  else if (f.phoenix?.hatched) labels.push("涅槃已用");
  if (f.hawkForm?.active) labels.push(f.combo ? "地面 · 连击" : "地面形态");
  if (f.windup) {
    labels.push("真言蓄力");
    c.strokeStyle = "#ffe3a2";
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
  if (f.devourSpent) labels.push("吞噬已用");
  if (f.stunUntil > time) {
    labels.push("眩晕");
    c.fillStyle = "#ffe080";
    for (let i = 0; i < 3; i++) {
      const a = (reducedMotion ? 0 : time * 2) + (i * Math.PI * 2) / 3;
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
  if (f.air?.cast)
    labels.push(
      f.air.cast.kind === "ark"
        ? "重炮蓄力"
        : f.air.cast.kind === "ironape"
          ? `震爆蓄力 · ${Math.max(0, (f.air.cast.next - time) / 4).toFixed(2)}s`
          : f.air.cast.kind === "specialist"
            ? `锁定 · ${Math.max(0, (f.air.cast.next - time) / 4).toFixed(2)}s`
            : f.air.cast.kind === "irondog"
              ? `震荡 · 余${f.air.cast.remaining}次`
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
  if (labels.length) {
    c.font = "bold 11px sans-serif";
    c.textAlign = "center";
    c.strokeStyle = "#101c1b";
    c.lineWidth = 3;
    c.strokeText(labels.join(" · "), 0, 36);
    c.fillStyle = f.stunUntil > time ? "#ffe080" : "#aee5f0";
    c.fillText(labels.join(" · "), 0, 36);
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
  if (!cast || f.hp <= 0) return;
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
  } else if (cast.kind === "motorcycle") {
    const p = project(f.x + 0.5, f.y + 0.5);
    c.setLineDash([]);
    c.strokeStyle = "#ffc173";
    c.fillStyle = "#ffc173";
    // Ammo markers, not an AoE footprint: each round selects one target independently.
    for (let i = 0; i < 3; i++) {
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
