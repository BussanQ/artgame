import type { Fighter } from "../engine/types";

/** Temporary size communicates rage; board occupancy and game rules stay unchanged. */
export function taotieScale(f: Pick<Fighter, "hp" | "taotie">, time: number) {
  return f.hp > 0 && f.taotie?.rage && f.taotie.rage.until > time ? 1.18 : 1;
}
