/** Pure animation sampling; no combat damage or simulation timing changes. */
export const MELEE_ACTIONS = {
  guard: { name: "蓄势盾击", duration: 3.6, color: "#bfe9e6" },
  pangolin: { name: "蜷身滚撞", duration: 2.8, color: "#e8bd73" },
  panda: { name: "双刃交错斩", duration: 1.9, color: "#e8b1ff" },
  lion: { name: "跃身爪击", duration: 2.8, color: "#ffd18a" },
  monk: { name: "沉身推掌", duration: 2.8, color: "#9ee8c5" },
  wolf: { name: "幽影扑咬", duration: 1.9, color: "#78e7ff" },
  master: { name: "旋身横扫", duration: 2.8, color: "#ffdb8c" },
  titan: { name: "蓄力重砸", duration: 3.8, color: "#ffb56b" },
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
export function isMelee(id: string): id is MeleeId {
  return id in MELEE_ACTIONS;
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
