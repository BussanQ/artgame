import { CURRENT_COMBAT_VERSION, hasShurikenRules, hasSecretOrbRules, type CombatVersion } from "../engine/types";
/** Pure animation sampling; no combat damage or simulation timing changes. */
export const MELEE_ACTIONS = {
  elephant: { name: "踏步扬鼻挑牙", duration: 3.8, color: "#e5bd83" },
  venombeast: { name: "压肩横甩撕咬", duration: 3.6, color: "#b7dc76" },
  staffthrall: { name: "双手点棍与疾风轮转", duration: 3.4, color: "#85c8ff" },
  shieldthrall: { name: "架盾弓步重推", duration: 3.8, color: "#8cf0cc" },
  bladethrall: { name: "压身拔刀瞬斩", duration: 3.5, color: "#b8d6ff" },
  swordthrall: { name: "双刀错步回切", duration: 3.8, color: "#a9eadc" },
  axethrall: { name: "侧身引斧斜劈", duration: 3.4, color: "#79e3cb" },
  ironape: { name: "双拳举臂震地", duration: 3.6, color: "#efb46c" },
  irondog: { name: "液压前扑钳咬", duration: 3.2, color: "#e8be7c" },
  bloodhawk: { name: "收翼俯冲撕爪", duration: 2.8, color: "#ffaaa0" },
  vajra: { name: "四臂交替重拳", duration: 3.8, color: "#e8d193" },
  vine: { name: "双藤甩鞭", duration: 3.8, color: "#b7eb9b" },
  treant: { name: "抬根重踏", duration: 3.8, color: "#b9dba7" },
  blastbug: { name: "鼓腹钳击", duration: 3.8, color: "#ffc176" },
  shark: { name: "摆尾噬咬", duration: 3.8, color: "#89e6e2" },
  guard: { name: "蓄势盾击", duration: 3.6, color: "#bfe9e6" },
  pangolin: { name: "蜷身滚撞", duration: 2.8, color: "#e8bd73" },
  panda: { name: "双刃交错斩", duration: 1.9, color: "#e8b1ff" },
  lion: { name: "跃身爪击", duration: 2.8, color: "#ffd18a" },
  monk: { name: "沉身推掌", duration: 2.8, color: "#9ee8c5" },
  wolf: { name: "幽影扑咬", duration: 1.9, color: "#78e7ff" },
  master: { name: "旋身横扫", duration: 2.8, color: "#ffdb8c" },
  titan: { name: "蓄力重砸", duration: 3.8, color: "#ffb56b" },
  cavalry: { name: "扬蹄挺枪", duration: 2.8, color: "#d9ddb0" },
  shadowblade: { name: "残影回旋斩", duration: 1.9, color: "#d7a0ff" },
  turtle: { name: "伏甲顶撞", duration: 3.8, color: "#b5d991" },
  bull: { name: "沉肩裂地斧", duration: 3.8, color: "#ffad79" },
} as const;
export type MeleeId = keyof typeof MELEE_ACTIONS;
export interface AttackPose {
  forward: number;
  lift: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  impact: number;
  trail: number;
}
export const REST_POSE: AttackPose = {
  forward: 0,
  lift: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  alpha: 1,
  impact: 0,
  trail: 0,
};
export function isMelee(id: string, version: CombatVersion = CURRENT_COMBAT_VERSION): id is MeleeId {
  return Object.hasOwn(MELEE_ACTIONS,id) && (id !== "panda" || !hasShurikenRules(version)) &&
    (id !== "monk" || !hasSecretOrbRules(version));
}
/** Hold the raised pose until the simulation emits the slam, never show an early impact. */
export function ironapeChargePose(progress: number): AttackPose {
  const t = Math.max(0, Math.min(1, progress));
  return {
    ...REST_POSE,
    lift: 18 * t,
    rotation: -0.14 * t,
    scaleX: 1 - 0.06 * t,
    scaleY: 1 + 0.13 * t,
  };
}
export function bladeStormPose(time: number): AttackPose {
  return {
    ...REST_POSE,
    rotation: Math.sin(time * 3.2) * 0.17,
    scaleX: 0.58 + Math.abs(Math.cos(time * 1.6)) * 0.42,
    lift: 2 + Math.sin(time * 3.2) * 2,
    trail: 1,
  };
}
const pulse = (t: number, a: number, b: number) =>
  t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a));
export function meleePose(id: MeleeId, t: number, skill = false): AttackPose {
  if (t <= 0 || t >= 1) return { ...REST_POSE };
  const p = { ...REST_POSE },
    wind = pulse(t, 0, 0.28),
    hit = pulse(t, 0.2, 0.65),
    recover = pulse(t, 0.55, 1),
    power = skill ? 1.22 : 1;
  p.impact = pulse(t, 0.28, 0.68) * power;
  switch (id) {
    case "elephant":
      p.forward = -7 * wind + (skill ? 32 : 18) * hit - 5 * recover;
      p.rotation = -0.12 * wind - (skill ? 0.28 : 0.16) * hit + 0.08 * recover;
      p.lift = (skill ? 14 : 8) * hit - 4 * recover;
      p.scaleX = 1 - 0.05 * wind + 0.12 * hit;
      p.scaleY = 1 + 0.09 * hit;
      p.trail = hit * (skill ? 0.7 : 0.25);
      break;
    case "venombeast":
      p.forward = -13 * wind + (skill ? 12 : 26) * hit - 4 * recover;
      p.rotation = 0.12 * wind - 0.21 * hit + 0.13 * recover;
      p.lift = -6 * wind + (skill ? 8 : 2) * hit;
      p.scaleX = 1 - 0.1 * wind + 0.15 * hit;
      p.scaleY = 1 - 0.08 * wind - 0.04 * hit;
      p.trail = 0.5 * hit;
      break;
    case "staffthrall":
      p.forward = -8 * wind + (skill ? 25 : 20) * hit - 4 * recover;
      p.rotation = skill
        ? Math.sin(t * Math.PI * 2) * 0.42
        : -0.18 * wind + 0.32 * hit;
      p.lift = 5 * wind - 3 * hit;
      p.scaleX = skill
        ? 0.65 + Math.abs(Math.cos(t * Math.PI * 2)) * 0.35
        : 1 - 0.08 * wind;
      p.scaleY = 1 - 0.06 * hit;
      p.trail = hit * (skill ? 1.6 : 0.6);
      break;
    case "shieldthrall":
      p.forward = -6 * wind + 22 * hit - 3 * recover;
      p.rotation = -0.1 * wind + 0.19 * hit;
      p.scaleX = 1 + 0.11 * hit;
      p.scaleY = 1 - 0.09 * hit;
      p.lift = -3 * wind + 2 * recover;
      p.trail = 0.3 * hit;
      break;
    case "bladethrall":
      p.forward =
        -15 * wind + (skill ? 43 : 31) * pulse(t, 0.27, 0.57) - 4 * recover;
      p.rotation = -0.22 * wind + 0.38 * pulse(t, 0.27, 0.57) - 0.08 * recover;
      p.scaleX = 1 - 0.18 * wind + 0.14 * hit;
      p.scaleY = 1 - 0.12 * wind;
      p.lift = -8 * wind + 3 * hit;
      p.trail = hit * (skill ? 1.4 : 0.7);
      break;
    case "swordthrall":
      p.forward =
        -7 * wind + 17 * pulse(t, 0.18, 0.5) + 12 * pulse(t, 0.5, 0.91);
      p.rotation =
        -0.3 * wind + 0.28 * pulse(t, 0.18, 0.5) - 0.22 * pulse(t, 0.5, 0.91);
      p.scaleX = 1 - 0.15 * wind + 0.08 * hit;
      p.lift = 3 * wind - 3 * hit;
      p.trail = 0.8 * hit;
      break;
    case "axethrall":
      p.forward = -10 * wind + (skill ? 12 : 24) * hit;
      p.rotation = -0.28 * wind + (skill ? 0.42 : 0.31) * hit - 0.06 * recover;
      p.lift = 6 * wind - 5 * hit;
      p.scaleX = 1 - 0.09 * wind + 0.1 * hit;
      p.scaleY = 1 + 0.05 * wind - 0.07 * hit;
      p.trail = 0.7 * hit;
      break;
    case "ironape":
      p.forward = -9 * wind + 17 * hit;
      p.lift = 18 * wind - 12 * hit + 3 * recover;
      p.rotation = -0.14 * wind + 0.22 * hit;
      p.scaleX = 1 - 0.06 * wind + 0.19 * hit;
      p.scaleY = 1 + 0.13 * wind - 0.2 * hit;
      p.trail = 0.35 * hit;
      break;
    case "irondog":
      p.forward = -15 * wind + 32 * hit - 5 * recover;
      p.lift = 7 * wind - 4 * hit;
      p.rotation = -0.09 * wind + 0.13 * hit;
      p.scaleX = 1 - 0.1 * wind + 0.14 * hit;
      p.scaleY = 1 - 0.16 * hit;
      p.trail = 0.25 * hit;
      break;
    case "bloodhawk":
      p.lift = 28 * wind - 10 * hit;
      p.forward = -12 * wind + 42 * hit;
      p.rotation = -0.24 * wind + 0.35 * hit;
      p.scaleX = 1 - 0.18 * wind + 0.08 * hit;
      p.trail = hit;
      break;
    case "vajra":
      p.forward = 20 * pulse(t, 0.14, 0.48) + 30 * pulse(t, 0.48, 0.86);
      p.rotation = -0.16 * pulse(t, 0.14, 0.48) + 0.19 * pulse(t, 0.48, 0.86);
      p.scaleY = 1 - 0.12 * wind;
      p.lift = -6 * hit;
      break;
    case "vine":
      p.rotation = -0.35 * wind + 0.48 * hit;
      p.scaleX = 1 - 0.16 * wind + 0.24 * hit;
      p.forward = -10 * wind + 28 * hit;
      p.trail = 0.7 * hit;
      break;
    case "treant":
      p.lift = 24 * wind - 9 * hit;
      p.scaleY = 1 + 0.08 * wind - 0.18 * hit;
      p.rotation = -0.06 * wind + 0.1 * hit;
      p.forward = 14 * hit;
      break;
    case "blastbug":
      p.scaleX = 1 + 0.22 * wind;
      p.scaleY = 1 + 0.16 * wind - 0.12 * hit;
      p.forward = -8 * wind + 25 * hit;
      p.rotation = -0.08 * wind + 0.12 * hit;
      p.lift = 4 * recover;
      break;
    case "shark":
      p.forward = -18 * wind + 34 * hit;
      p.rotation = 0.25 * wind - 0.18 * hit;
      p.scaleX = 1 + 0.18 * hit;
      p.lift = 6 * wind + 5 * recover;
      p.trail = 0.35 * hit;
      break;
    case "cavalry":
      p.lift = 20 * wind + 5 * hit;
      p.rotation = -0.24 * wind + 0.08 * hit;
      p.forward = -12 * wind + 38 * hit;
      p.trail = 0.6 * hit;
      break;
    case "shadowblade":
      p.forward = 28 * pulse(t, 0.12, 0.9);
      p.rotation = -0.6 * wind + 1.8 * hit;
      p.alpha = 1 - 0.62 * pulse(t, 0.05, 0.55);
      p.lift = 16 * hit;
      p.trail = hit;
      break;
    case "turtle":
      p.forward = -6 * wind + 23 * pulse(t, 0.35, 0.85);
      p.scaleY = 1 - 0.22 * wind;
      p.scaleX = 1 + 0.14 * wind;
      p.rotation = 0.08 * hit;
      p.lift = -4 * hit;
      break;
    case "bull":
      p.forward = -14 * wind + 29 * hit;
      p.rotation = -0.38 * wind + 0.58 * pulse(t, 0.28, 0.75);
      p.lift = 12 * wind - 7 * hit;
      p.scaleY = 1 - 0.09 * recover;
      break;
    case "guard":
      p.forward = -9 * wind + 30 * hit;
      p.rotation = -0.14 * wind + 0.2 * hit;
      p.scaleX = 1 + 0.1 * hit;
      p.scaleY = 1 - 0.06 * hit;
      break;
    case "pangolin":
      p.forward = 34 * pulse(t, 0.12, 0.86);
      p.rotation = Math.PI * 2 * Math.min(1, Math.max(0, (t - 0.1) / 0.8));
      p.scaleX = 1 - 0.24 * pulse(t, 0.05, 0.85);
      p.scaleY = 1 - 0.2 * pulse(t, 0.05, 0.85);
      p.lift = 9 * pulse(t, 0.15, 0.8);
      p.trail = hit;
      break;
    case "panda": {
      const slash1 = pulse(t, 0.08, 0.45),
        slash2 = pulse(t, 0.43, 0.84);
      p.forward = 19 * slash1 + 26 * slash2;
      p.rotation = -0.32 * slash1 + 0.4 * slash2;
      p.lift = 10 * slash2;
      p.trail = Math.max(slash1, slash2);
      break;
    }
    case "lion":
      p.forward = -7 * wind + 36 * hit;
      p.lift = 29 * pulse(t, 0.12, 0.65);
      p.rotation = -0.2 * wind + 0.24 * hit;
      p.scaleY = 1 - 0.16 * wind;
      p.trail = hit * 0.4;
      break;
    case "monk":
      p.forward = -4 * wind + 17 * hit;
      p.scaleY = 1 - 0.14 * wind;
      p.scaleX = 1 + 0.1 * wind;
      p.rotation = -0.1 * wind + 0.1 * hit;
      p.lift = 4 * recover;
      break;
    case "wolf":
      p.forward = 43 * pulse(t, 0.16, 0.7);
      p.lift = 13 * hit;
      p.scaleX = 1 + 0.26 * hit;
      p.scaleY = 1 - 0.17 * hit;
      p.alpha = 1 - 0.5 * wind;
      p.trail = hit;
      break;
    case "master":
      p.forward = 12 * hit;
      p.rotation = -0.5 * wind + 1.1 * hit - 0.2 * recover;
      p.lift = 9 * pulse(t, 0.16, 0.75);
      p.trail = hit * 0.6;
      break;
    case "titan":
      p.forward = -5 * wind + 20 * hit;
      p.lift = 27 * pulse(t, 0.04, 0.4) - 9 * pulse(t, 0.4, 0.65);
      p.rotation = -0.2 * wind + 0.32 * hit;
      p.scaleX = 1 + 0.14 * pulse(t, 0.4, 0.7);
      p.scaleY = 1 - 0.18 * pulse(t, 0.4, 0.7);
      break;
  }
  p.forward *= power;
  p.lift *= power;
  return p;
}
/** Weapon silhouettes and contact traces reinforce each unit's attack, in target-facing coordinates. */
export function drawMeleeWeapon(
  c: CanvasRenderingContext2D,
  id: MeleeId,
  t: number,
  scale: number,
  skill: boolean,
) {
  if (t <= 0 || t >= 1) return;
  const power = skill ? 1.3 : 1,
    hit = pulse(t, 0.2, 0.85);
  c.save();
  c.scale(scale, scale);
  c.globalAlpha = hit;
  c.strokeStyle = MELEE_ACTIONS[id].color;
  c.fillStyle = MELEE_ACTIONS[id].color;
  c.shadowColor = MELEE_ACTIONS[id].color;
  c.shadowBlur = skill ? 20 : 9;
  c.lineWidth = 3 * power;
  c.lineCap = "round";
  const arc = (x: number, y: number, r: number, a: number, b: number) => {
    c.beginPath();
    c.arc(x, y, r, a, b);
    c.stroke();
  };
  switch (id) {
    case "elephant":
      c.lineWidth = skill ? 5 : 3;
      for (const offset of [-9, 9])
        arc(20 + 26 * hit, -38 + offset, 29, -0.5 - 0.6 * hit, 1.3 - hit);
      if (skill) {
        c.beginPath();
        c.ellipse(18, 3, 18 + 28 * hit, 7 + 5 * hit, 0, 0, Math.PI * 2);
        c.stroke();
      }
      break;
    case "venombeast":
      for (const offset of [-1, 1]) {
        c.beginPath();
        c.moveTo(12 + 15 * hit, -44 + offset * (19 - 10 * hit));
        c.lineTo(45 + 25 * hit, -40 + offset * (12 - 8 * hit));
        c.lineTo(52 + 25 * hit, -40);
        c.stroke();
      }
      if (skill) {
        c.fillStyle = "#b7f176";
        c.beginPath();
        c.arc(44 + 20 * hit, -44, 4 + 4 * hit, 0, Math.PI * 2);
        c.fill();
      }
      break;
    case "staffthrall":
      c.translate(8 + 12 * hit, -47);
      c.rotate(skill ? -0.5 + t * Math.PI * 4 : -1.1 + t * 2.2);
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(-60, 0);
      c.lineTo(65, 0);
      c.stroke();
      c.fillStyle = "#d6f1ff";
      c.fillRect(-64, -4, 12, 8);
      c.fillRect(57, -4, 12, 8);
      if (skill) {
        c.lineWidth = 2;
        arc(0, 0, 64, t * 4, t * 4 + 2.6);
        arc(0, 0, 56, t * 4 + Math.PI, t * 4 + Math.PI + 2.6);
      }
      break;
    case "shieldthrall": {
      const x = 13 + 27 * hit;
      c.beginPath();
      c.moveTo(x - 16, -76);
      c.lineTo(x + 18, -72);
      c.lineTo(x + 22, -48);
      c.lineTo(x, -15);
      c.lineTo(x - 20, -48);
      c.closePath();
      c.stroke();
      c.beginPath();
      c.moveTo(x, -66);
      c.lineTo(x, -28);
      c.stroke();
      if (skill) {
        arc(x + 12, -45, 28 + 15 * hit, -1.1, 1.1);
        arc(x + 15, -45, 40 + 15 * hit, -1, 1);
      }
      break;
    }
    case "bladethrall": {
      const reach = 20 + 66 * pulse(t, 0.22, 0.72);
      c.lineWidth = (skill ? 6 : 3) * power;
      c.beginPath();
      c.moveTo(-24, -25);
      c.quadraticCurveTo(25, -80, reach, -55);
      c.stroke();
      c.lineWidth = 1.5;
      c.strokeStyle = "#f1f8ff";
      c.beginPath();
      c.moveTo(-19, -23);
      c.lineTo(reach + 7, -57);
      c.stroke();
      if (skill) arc(30, -42, 38, -2.1, 0.5);
      break;
    }
    case "swordthrall":
      arc(5, -42, 45, -2.7 + t * 4, -1.1 + t * 4);
      arc(12, -38, 32, 1.7 - t * 5, 3.1 - t * 5);
      c.beginPath();
      c.moveTo(-12, -54);
      c.lineTo(40 + hit * 14, -31);
      c.stroke();
      break;
    case "axethrall":
      // A single long crescent sweep, distinct from the bull's two-sided ground axe.
      c.translate(12, -48);
      c.rotate(-1.9 + t * 3.7);
      c.fillRect(-2, -42, 4, 68);
      arc(0, -30, 22, -2.2, 1.1);
      arc(0, -30, 15, -2.2, 1.1);
      arc(0, 0, 53, -2.3, -0.7);
      break;
    case "ironape":
      for (const offset of [-15, 15]) {
        const y = -90 + 68 * hit;
        c.strokeRect(14 + offset, y, 22, 18);
        c.beginPath();
        c.moveTo(23 + offset, y - 27);
        c.lineTo(23 + offset, y);
        c.stroke();
        arc(25 + offset, -12, 12 + hit * 15, 0, Math.PI);
      }
      break;
    case "irondog":
      // Two hydraulic jaws close around the impact point.
      for (const sign of [-1, 1]) {
        c.beginPath();
        c.moveTo(12, -40 + sign * (17 - hit * 8));
        c.lineTo(45 + hit * 16, -40 + sign * (9 - hit * 5));
        c.lineTo(37 + hit * 16, -40);
        c.stroke();
      }
      break;
    case "bloodhawk":
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(5 + i * 11, -85);
        c.quadraticCurveTo(55 + i * 9, -55, 35 + i * 7, -18);
        c.stroke();
      }
      break;
    case "vajra":
      for (let i = 0; i < 4; i++) {
        const shift = Math.sin(t * Math.PI * 4 + (i * Math.PI) / 2) * 14;
        c.strokeRect(18 + shift, -68 + i * 13, 17, 12);
        c.beginPath();
        c.moveTo(-8 + shift, -62 + i * 13);
        c.lineTo(16 + shift, -62 + i * 13);
        c.stroke();
      }
      break;
    case "blastbug":
      arc(25, -26, 20, -0.8 - hit, 0.3);
      arc(25, -26, 20, -0.3, 0.8 + hit);
      break;
    case "shark":
      arc(34, -42, 26, -1.2, 1.2);
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(20 + i * 9, -65);
        c.lineTo(26 + i * 9, -48 + i * 3);
        c.lineTo(32 + i * 9, -65);
        c.stroke();
      }
      break;
    case "cavalry":
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(-18, -45);
      c.lineTo(60 + hit * 20, -55);
      c.stroke();
      c.beginPath();
      c.moveTo(60 + hit * 20, -55);
      c.lineTo(48 + hit * 20, -61);
      c.lineTo(51 + hit * 20, -48);
      c.closePath();
      c.fill();
      break;
    case "shadowblade":
      arc(8, -45, 44, t * 8 - 2, t * 8 + 0.6);
      arc(8, -45, 34, -t * 7, -t * 7 + 2.1);
      break;
    case "turtle":
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse(15 + i * 12 + hit * 20, -25, 7, 20 + i * 5, 0, -1.1, 1.1);
        c.stroke();
      }
      break;
    case "bull":
      c.translate(12, -45);
      c.rotate(-1.5 + t * 3.8);
      c.fillRect(-4, -48, 8, 68);
      c.beginPath();
      c.moveTo(-25, -45);
      c.lineTo(25, -45);
      c.lineTo(17, -24);
      c.lineTo(-17, -24);
      c.closePath();
      c.fill();
      arc(0, 0, 48, -2, -0.6);
      break;
    case "guard":
      c.translate(31, -47);
      c.rotate(-0.2 + hit * 0.35);
      c.fillStyle = "#bfe9e62b";
      c.fillRect(-9, -22, 18, 44);
      c.strokeRect(-9, -22, 18, 44);
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(16 + i * 8, -18);
        c.lineTo(23 + i * 8, 0);
        c.lineTo(16 + i * 8, 18);
        c.stroke();
      }
      break;
    case "pangolin":
      arc(8, -29, 29, -t * 6, -t * 6 + 4);
      arc(8, -29, 35, t * 5, t * 5 + 2);
      for (let i = 0; i < 6; i++) {
        c.fillRect(-35 - i * 9, -5 - (i % 2) * 8, 5, 4);
      }
      break;
    case "panda":
      c.lineWidth = 4;
      arc(18, -43, 37, -2.3 + t * 5, -1 + t * 5);
      arc(15, -43, 30, 2.4 - t * 5, 3.8 - t * 5);
      break;
    case "lion":
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(16 + i * 10, -74);
        c.quadraticCurveTo(55 + i * 7, -45, 25 + i * 10, -23);
        c.stroke();
      }
      break;
    case "monk":
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse(
          20 + t * 42 + i * 9,
          -45,
          8 + i * 4,
          18 + i * 8,
          0,
          0,
          Math.PI * 2,
        );
        c.stroke();
      }
      break;
    case "wolf":
      c.beginPath();
      c.moveTo(26, -64);
      c.lineTo(48, -44);
      c.lineTo(27, -27);
      c.stroke();
      c.beginPath();
      c.moveTo(39, -65);
      c.lineTo(61, -44);
      c.lineTo(40, -26);
      c.stroke();
      break;
    case "master":
      c.translate(0, -48);
      c.rotate(-1.4 + t * 4.8);
      c.lineWidth = 7;
      c.strokeStyle = "#9d683d";
      c.beginPath();
      c.moveTo(-53, 0);
      c.lineTo(53, 0);
      c.stroke();
      c.lineWidth = 3;
      c.strokeStyle = "#ffe3a4";
      c.beginPath();
      c.moveTo(-54, 0);
      c.lineTo(-37, 0);
      c.moveTo(37, 0);
      c.lineTo(54, 0);
      c.stroke();
      arc(0, 0, 55, -0.8, 0.3);
      break;
    case "titan":
      c.translate(23, -94 + hit * 73);
      c.fillStyle = "#9b6948";
      c.fillRect(-13, -13, 26, 25);
      c.strokeRect(-13, -13, 26, 25);
      c.beginPath();
      c.moveTo(-10, -40);
      c.lineTo(-10, -20);
      c.moveTo(9, -46);
      c.lineTo(9, -20);
      c.stroke();
      break;
  }
  c.restore();
}
