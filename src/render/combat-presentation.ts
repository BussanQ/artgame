import type { Battle, Fighter } from "../engine/types";
import { attackInterval } from "../engine/abilities";
import { REST_POSE, type AttackPose } from "./melee";
import { project } from "./projection";

const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const DEATH_FADE_TICKS = 2.5;
/** A summon may be born and killed in one tick: an earlier fighter need not exist. */
export function deathFade(
  battle: Battle,
  uid: number,
  index: number,
  time: number,
) {
  const fighter = battle.frames[index]?.fighters.find((f) => f.uid === uid);
  if (!fighter || fighter.hp > 0) return 0;
  let start = index;
  while (start > 0 && time - start < DEATH_FADE_TICKS) {
    const previous = battle.frames[start - 1].fighters.find(
      (f) => f.uid === uid,
    );
    if (!previous || previous.hp > 0) break;
    start--;
  }
  return clamp((time - start) / DEATH_FADE_TICKS);
}

export interface BullTransformation {
  start: number;
  progress: number;
  alpha: number;
  moving: boolean;
  from: { x: number; y: number };
  to: { x: number; y: number };
  position: { x: number; y: number };
  travel: number;
  impact: number;
}
/** Read existing cast/dash events only. No future frame or combat state is modified. */
export function bullTransformation(
  battle: Battle,
  fighter: Fighter,
  time: number,
  reduced = false,
): BullTransformation | null {
  if (fighter.defId !== "bull" || fighter.hp <= 0) return null;
  const index = Math.min(Math.floor(time), battle.frames.length - 1);
  for (let n = index; n >= Math.max(0, index - 4); n--) {
    const frame = battle.frames[n];
    const cast = frame.effects.find(
      (e) => e.kind === "cast" && e.source === fighter.uid,
    );
    if (!cast) {
      // A later normal attack interrupts recovery; never display an axe in giant-bull form.
      if (frame.events.some((e) => e.attacker === fighter.uid && !e.skill))
        return null;
      continue;
    }
    const caster = frame.fighters.find((f) => f.uid === fighter.uid)!;
    const duration = Math.min(3.2, attackInterval(caster, n));
    const age = time - n;
    if (age < 0 || age >= duration) return null;
    const dash = frame.effects.find(
      (e) =>
        e.kind === "teleport" &&
        e.source === fighter.uid &&
        e.target === fighter.uid &&
        e.name === "冲锋",
    );
    const from = dash?.from ?? { x: caster.x, y: caster.y };
    const to = dash?.to ?? { x: caster.x, y: caster.y };
    const progress = age / duration;
    const travel = reduced ? 1 : clamp(progress / 0.28);
    const eased = 1 - (1 - travel) ** 3;
    return {
      start: n,
      progress,
      from,
      to,
      travel,
      moving: from.x !== to.x || from.y !== to.y,
      position: reduced
        ? { x: fighter.x, y: fighter.y }
        : {
            x: from.x + (to.x - from.x) * eased,
            y: from.y + (to.y - from.y) * eased,
          },
      alpha: reduced
        ? 1
        : Math.min(clamp(progress / 0.12), clamp((1 - progress) / 0.25)),
      impact: clamp((progress - 0.28) / 0.5),
    };
  }
  return null;
}

export function bullFormPose(
  form: BullTransformation,
  reduced = false,
): AttackPose {
  if (reduced) return { ...REST_POSE };
  const tension = Math.sin(Math.PI * form.progress);
  return {
    ...REST_POSE,
    scaleX: 1 + 0.08 * tension,
    scaleY: 1 - 0.07 * tension,
    lift: -3 * tension,
  };
}

export function drawBullCharge(
  c: CanvasRenderingContext2D,
  form: BullTransformation,
  particles: number,
  reduced = false,
) {
  if (reduced) return;
  const from = project(form.from.x + 0.5, form.from.y + 0.65);
  const at = project(form.position.x + 0.5, form.position.y + 0.65);
  const to = project(form.to.x + 0.5, form.to.y + 0.65);
  c.save();
  if (form.moving && form.progress < 0.5) {
    c.strokeStyle = "#edb576";
    c.lineWidth = 3;
    c.globalAlpha = Math.max(0, 0.6 - form.progress);
    for (const offset of [-10, 10]) {
      c.beginPath();
      c.moveTo(from.x, from.y + offset);
      c.lineTo(at.x, at.y + offset);
      c.stroke();
    }
  }
  if (form.progress >= 0.28 && form.impact < 1) {
    c.globalAlpha = (1 - form.impact) * 0.8;
    c.strokeStyle = "#ffd49b";
    c.lineWidth = 4 - form.impact * 2;
    c.beginPath();
    c.ellipse(
      to.x,
      to.y,
      18 + form.impact * 72,
      6 + form.impact * 25,
      0,
      0,
      Math.PI * 2,
    );
    c.stroke();
    for (let i = 0; i < Math.min(8, particles); i++) {
      const angle = i * 2.39996;
      c.fillStyle = i % 2 ? "#c7a583" : "#f1c38f";
      c.fillRect(
        to.x + Math.cos(angle) * 65 * form.impact,
        to.y +
          Math.sin(angle) * 22 * form.impact -
          Math.sin(form.impact * Math.PI) * 18,
        3,
        3,
      );
    }
  }
  c.restore();
}
