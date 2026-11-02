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
    cast: "#ffe0a0",
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
  if (e.kind === "cast") {
    const radius = 24 + Math.min(2, e.amount) * 22 + age * 13;
    c.beginPath();
    c.ellipse(origin.x, origin.y, radius, radius * 0.35, 0, 0, Math.PI * 2);
    c.stroke();
    c.font = "bold 17px sans-serif";
    c.textAlign = "center";
    c.fillText(e.name, origin.x, origin.y - 100 - age * 7);
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
  if (f.hasteUntil > time) labels.push("加速");
  if (f.armorBreakUntil > time) labels.push("破甲");
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
