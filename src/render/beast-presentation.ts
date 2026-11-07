import type { Fighter } from "../engine/types";
import { REST_POSE, type AttackPose } from "./melee";

/** Visual dive/eruption only; no invulnerability, hidden state or board movement is added. */
export function burrowPose(
  progress: number,
  reducedMotion = false,
): AttackPose {
  if (reducedMotion || progress <= 0 || progress >= 1) return { ...REST_POSE };
  const depth = Math.sin(Math.PI * progress);
  return {
    ...REST_POSE,
    lift: -42 * depth,
    scaleY: 1 - 0.65 * depth,
    alpha: 1 - 0.85 * depth,
    rotation: Math.sin(Math.PI * 2 * progress) * 0.15,
  };
}

/** Feet leave the board visually; logical position, targeting and flight traits stay intact. */
export function knockupLift(f: Fighter, time: number, reducedMotion = false) {
  if (reducedMotion || !f.knockup || f.hp <= 0) return 0;
  const t = (time - f.knockup.start) / (f.knockup.until - f.knockup.start);
  return t > 0 && t < 1 ? 48 * 4 * t * (1 - t) : 0;
}
