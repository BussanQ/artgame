import { REST_POSE, type AttackPose } from "./melee";

/** Each contact is a separate engine event; never infer extra damage from animation. */
export function hawkGroundPose(progress: number, strike = 1): AttackPose {
  if (progress <= 0 || progress >= 1) return { ...REST_POSE };
  const hit = Math.sin(progress * Math.PI),
    side = strike === 2 ? -1 : 1;
  return {
    ...REST_POSE,
    forward: 18 * hit,
    lift: 3 * hit,
    rotation: side * 0.22 * hit,
    scaleX: 1 + 0.1 * hit,
    scaleY: 1 - 0.06 * hit,
    impact: hit,
    trail: hit * 0.5,
  };
}
