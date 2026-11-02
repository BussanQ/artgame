import { UNIT, TRAITS } from "../data/units";
import type { Piece, Trait } from "./types";
export function synergies(pieces: Piece[]) {
  const counts = new Map<Trait, number>();
  for (const id of new Set(
    pieces.filter((p) => p.position !== null).map((p) => p.defId),
  ))
    for (const trait of UNIT[id].traits)
      counts.set(trait, (counts.get(trait) ?? 0) + 1);
  return [...counts].map(([trait, count]) => ({
    trait,
    count,
    ...TRAITS[trait],
    active: count >= TRAITS[trait].threshold,
  }));
}
