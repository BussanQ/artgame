import { STAFF_GALE } from "../data/skills";
import type { Fighter } from "./types";

export function staffSpeed(f: Fighter) {
  return f.gale && f.gale.target !== null && f.gale.side === f.side && f.hp > 0
    ? f.gale.stacks * STAFF_GALE.speedPerStack[f.star - 1]
    : 0;
}

export function staffArmor(f: Fighter) {
  return f.gale &&
    f.gale.side === f.side &&
    f.hp > 0 &&
    f.gale.target !== null &&
    f.gale.stacks === STAFF_GALE.maxStacks
    ? STAFF_GALE.armorAtMax
    : 0;
}

/** Preserve elapsed attack progress when a chain loses its speed bonus. */
export function retargetStaff(f: Fighter, target?: Fighter) {
  const state = f.gale;
  if (!state) return;
  const next =
    f.hp > 0 && target?.hp && target.side !== f.side ? target.uid : null;
  if (state.target === next && state.side === f.side) return;
  const formationHaste = f.formationHaste ?? 0;
  f.cooldown *=
    (1 + formationHaste + state.stacks * STAFF_GALE.speedPerStack[f.star - 1]) /
    (1 + formationHaste);
  state.target = next;
  state.stacks = 0;
  state.side = f.side;
}

/** The battle dispatcher has already checked visibility, range and hard control. */
export function recordStaffAttack(f: Fighter, target: Fighter) {
  if (!f.gale || f.defId !== "staffthrall" || f.summon || f.hp <= 0) return 0;
  retargetStaff(f, target);
  if (f.gale.target === null) return 0;
  f.gale.stacks = Math.min(STAFF_GALE.maxStacks, f.gale.stacks + 1);
  return f.gale.stacks;
}
