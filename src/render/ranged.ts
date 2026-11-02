import { REST_POSE, type AttackPose } from "./melee";
export const RANGED_ACTIONS = {
  infantry: {
    name: "步枪三连点射",
    duration: 2.8,
    fireAt: 0.15,
    impactAt: 0.48,
    color: "#ffd787",
  },
  sniper: {
    name: "定点蓄力狙击",
    duration: 3.8,
    fireAt: 0.4,
    impactAt: 0.54,
    color: "#b4edff",
  },
  chariot: {
    name: "仰炮抛射轰击",
    duration: 4.6,
    fireAt: 0.22,
    impactAt: 0.7,
    color: "#ffb66b",
  },
  cannon: {
    name: "聚能轨道炮",
    duration: 3.8,
    fireAt: 0.43,
    impactAt: 0.48,
    color: "#75edff",
  },
} as const;
export type RangedId = keyof typeof RANGED_ACTIONS;
export function isRanged(id: string): id is RangedId {
  return Object.hasOwn(RANGED_ACTIONS, id);
}
const pulse = (t: number, a: number, b: number) =>
  t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a));
export function rangedPose(id: RangedId, t: number, skill = false): AttackPose {
  if (t <= 0 || t >= 1) return { ...REST_POSE };
  const p = { ...REST_POSE };
  switch (id) {
    case "infantry": {
      const recoil =
        pulse(t, 0.15, 0.3) + pulse(t, 0.34, 0.49) + pulse(t, 0.53, 0.68);
      p.forward = -8 * recoil;
      p.rotation = -0.07 * recoil;
      p.lift = 1.5 * recoil;
      break;
    }
    case "sniper": {
      const aim = pulse(t, 0, 0.42),
        recoil = pulse(t, 0.4, 0.72);
      p.forward = 3 * aim - 16 * recoil;
      p.scaleY = 1 - 0.08 * aim;
      p.rotation = 0.035 * aim - 0.12 * recoil;
      break;
    }
    case "chariot": {
      const load = pulse(t, 0, 0.27),
        recoil = pulse(t, 0.22, 0.62);
      p.rotation = -0.19 * load + 0.16 * recoil;
      p.forward = -22 * recoil;
      p.lift = 5 * recoil;
      p.scaleY = 1 - 0.12 * recoil;
      break;
    }
    case "cannon": {
      const charge = pulse(t, 0, 0.48),
        recoil = pulse(t, 0.43, 0.82);
      p.forward = -3 * charge - 29 * recoil;
      p.scaleX = 1 + 0.035 * charge;
      p.scaleY = 1 - 0.1 * charge - 0.07 * recoil;
      p.rotation = -0.04 * recoil;
      p.lift = -3 * charge;
      break;
    }
  }
  if (skill) {
    p.forward *= 1.25;
    p.lift *= 1.2;
  }
  return p;
}
export interface Point {
  x: number;
  y: number;
}
export function projectilePoint(
  from: Point,
  to: Point,
  t: number,
  arc = 0,
): Point {
  const u = Math.max(0, Math.min(1, t));
  return {
    x: from.x + (to.x - from.x) * u,
    y: from.y + (to.y - from.y) * u - Math.sin(u * Math.PI) * arc,
  };
}
/** All visual bursts belong to ONE actual attack event; no extra damage is applied. */
export function drawRangedAttack(
  c: CanvasRenderingContext2D,
  id: RangedId,
  t: number,
  from: Point,
  to: Point,
  skill: boolean,
) {
  if (t < 0 || t >= 1) return;
  const profile = RANGED_ACTIONS[id],
    power = skill ? 1.45 : 1,
    dx = to.x - from.x,
    dy = to.y - from.y,
    angle = Math.atan2(dy, dx);
  c.save();
  c.strokeStyle = profile.color;
  c.fillStyle = profile.color;
  c.shadowColor = profile.color;
  c.shadowBlur = skill ? 18 : 10;
  c.lineCap = "round";
  const line = (a: Point, b: Point, width: number, alpha = 1) => {
    c.save();
    c.globalAlpha = alpha;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
    c.restore();
  };
  const ring = (p: Point, r: number, alpha: number) => {
    c.save();
    c.globalAlpha = alpha;
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(p.x, p.y, r, r * 0.45, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  };
  const flash = (intensity: number) => {
    if (intensity <= 0) return;
    c.save();
    c.translate(from.x, from.y);
    c.rotate(angle);
    c.globalAlpha = intensity;
    c.fillStyle = "#fff4c5";
    c.beginPath();
    c.moveTo(-4, -5);
    c.lineTo(22 * power, 0);
    c.lineTo(-4, 5);
    c.lineTo(3, 0);
    c.closePath();
    c.fill();
    c.restore();
  };
  const sparks = (progress: number, count: number = 7) => {
    if (progress < 0 || progress > 1) return;
    c.save();
    c.globalAlpha = 1 - progress;
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count,
        reach = (10 + progress * 35) * power;
      c.fillRect(
        to.x + Math.cos(a) * reach,
        to.y + Math.sin(a) * reach * 0.6,
        3,
        3,
      );
    }
    c.restore();
  };
  switch (id) {
    case "infantry":
      for (const start of [0.15, 0.34, 0.53]) {
        const u = (t - start) / 0.14;
        if (u >= 0 && u <= 1) {
          const a = projectilePoint(from, to, Math.max(0, u - 0.14)),
            b = projectilePoint(from, to, u);
          line(a, b, 2 * power);
          flash(1 - u);
        }
        const casing = (t - start) / 0.32;
        if (casing >= 0 && casing <= 1) {
          c.save();
          c.globalAlpha = 1 - casing;
          c.fillStyle = "#e8b958";
          c.translate(
            from.x - 12 - casing * 25,
            from.y + Math.sin(casing * Math.PI) * -15 + casing * 15,
          );
          c.rotate(casing * 8);
          c.fillRect(-3, -1, 6, 2);
          c.restore();
        }
        sparks((t - start - 0.14) / 0.2, 4);
      }
      break;
    case "sniper":
      if (t < 0.4) {
        line(from, to, 1, Math.sin((t / 0.4) * Math.PI) * 0.5);
        c.save();
        c.globalAlpha = t / 0.4;
        c.lineWidth = 1;
        const r = 20 * (1 - t / 0.5);
        c.beginPath();
        c.arc(to.x, to.y, r, 0, Math.PI * 2);
        c.moveTo(to.x - r - 5, to.y);
        c.lineTo(to.x + r + 5, to.y);
        c.moveTo(to.x, to.y - r - 5);
        c.lineTo(to.x, to.y + r + 5);
        c.stroke();
        c.restore();
      }
      if (t >= 0.4 && t < 0.54) {
        const u = (t - 0.4) / 0.14;
        line(
          projectilePoint(from, to, Math.max(0, u - 0.35)),
          projectilePoint(from, to, u),
          3 * power,
        );
        flash(1 - u * 0.6);
      }
      if (t >= 0.54) {
        const fade = 1 - (t - 0.54) / 0.46;
        line(from, to, 1, fade * 0.25);
        ring(to, 8 + (t - 0.54) * 38, fade);
        sparks((t - 0.54) / 0.4, 9);
      }
      break;
    case "chariot": {
      const u = (t - 0.22) / 0.48;
      if (u >= 0 && u <= 1) {
        const arc = 90 * power,
          p = projectilePoint(from, to, u, arc);
        for (let i = 1; i <= 6; i++) {
          const trail = projectilePoint(
            from,
            to,
            Math.max(0, u - i * 0.035),
            arc,
          );
          c.save();
          c.globalAlpha = (1 - i / 7) * 0.25;
          c.fillStyle = "#c6bca9";
          c.beginPath();
          c.arc(trail.x, trail.y, 2 + i * 0.8, 0, Math.PI * 2);
          c.fill();
          c.restore();
        }
        c.fillStyle = "#ffcc79";
        c.beginPath();
        c.arc(p.x, p.y, 5 * power, 0, Math.PI * 2);
        c.fill();
        flash(Math.max(0, 1 - u * 4));
      }
      if (t >= 0.7) {
        const v = (t - 0.7) / 0.3;
        c.save();
        c.globalAlpha = 1 - v;
        const g = c.createRadialGradient(
          to.x,
          to.y,
          0,
          to.x,
          to.y,
          Math.max(1, 38 * v + 12) * power,
        );
        g.addColorStop(0, "#fff5c9");
        g.addColorStop(0.3, "#ffb755cc");
        g.addColorStop(1, "#ec704000");
        c.fillStyle = g;
        c.beginPath();
        c.arc(to.x, to.y, (38 * v + 12) * power, 0, Math.PI * 2);
        c.fill();
        c.restore();
        ring(to, (15 + v * 46) * power, 1 - v);
        sparks(v, 12);
      }
      break;
    }
    case "cannon": {
      if (t < 0.43) {
        const charge = t / 0.43;
        c.save();
        c.globalAlpha = charge;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(from.x, from.y, 5 + charge * 12 * power, 0, Math.PI * 2);
        c.stroke();
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5 + t * 9,
            r = 32 * (1 - charge) + 8;
          c.beginPath();
          c.arc(
            from.x + Math.cos(a) * r,
            from.y + Math.sin(a) * r,
            2,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
        c.restore();
      }
      if (t >= 0.43 && t < 0.78) {
        const fade = Math.max(0, 1 - (t - 0.43) / 0.35);
        line(from, to, 15 * power, fade * 0.25);
        line(from, to, 6 * power, fade);
        c.save();
        c.strokeStyle = "#e6ffff";
        line(from, to, 2.5 * power, fade);
        c.restore();
        ring(from, 12 + (t - 0.43) * 40, fade);
        ring(to, 15 + (t - 0.43) * 65, fade);
        sparks((t - 0.48) / 0.4, 10);
      }
      break;
    }
  }
  c.restore();
}
