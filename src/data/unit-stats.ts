import type { UnitDef } from "../engine/types";
/** Permanent star growth, excluding gear and battle-only formations. */
export function unitArmor(
  unit: Pick<UnitDef, "armor" | "armorPerStar">,
  star: number,
) {
  return unit.armor + (unit.armorPerStar ?? 0) * (star - 1);
}
