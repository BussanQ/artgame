import { profileFor } from "../data/ai-profiles";
import { traitTiers } from "../data/traits";
import { UNIT } from "../data/units";
import { availableUnits, type RecruitmentContext } from "./rotation";
import type { CombatVersion, Piece, Player, Trait } from "./types";

function manaTiers(version: CombatVersion) {
  return Object.entries(traitTiers(version)).flatMap(([trait, tiers]) =>
    tiers
      .filter((tier) => (tier.bonus.mana ?? 0) > 0)
      .map((tier) => ({ trait: trait as Trait, count: tier.count })),
  );
}

/** Only real held pieces participate; duplicate copies never complete a tier. */
export function openingCores(
  player: Pick<Player, "pieces" | "level">,
  version: CombatVersion,
  strength: (piece: Piece) => number,
): Piece[][] {
  const strongest = [...player.pieces]
    .sort((a, b) => strength(b) - strength(a) || a.uid - b.uid)
    .filter((piece, index, all) =>
      all.findIndex((other) => other.defId === piece.defId) === index,
    );
  return manaTiers(version).flatMap(({ trait, count }) => {
    const members = strongest.filter((piece) => UNIT[piece.defId].traits.includes(trait));
    return count <= player.level && members.length >= count
      ? [members.slice(0, count)]
      : [];
  });
}

/** Collect the final distinct member of an attainable preferred opening tier. */
export function openingCollection(
  player: Player,
  context: RecruitmentContext,
  version: CombatVersion,
) {
  const profile = profileFor(player), available = availableUnits(context);
  return manaTiers(version)
    .filter(({ trait, count }) =>
      profile.traits.includes(trait) && count <= player.level + 1 &&
      available.filter((unit) => unit.traits.includes(trait)).length >= count,
    )
    .sort((a, b) => b.count - a.count)
    .map(({ trait, count }) => ({
      trait,
      target: count,
      kinds: new Set(player.pieces
        .filter((piece) => UNIT[piece.defId].traits.includes(trait))
        .map((piece) => piece.defId)),
    }))
    .find(({ kinds, target }) => kinds.size >= target - 1) ?? null;
}

/** A present offer completes a tier using already owned pieces, not future draws. */
export function completesOpening(
  player: Pick<Player, "pieces" | "level">,
  id: string,
  context: RecruitmentContext,
  version: CombatVersion,
) {
  if (!availableUnits(context).some((unit) => unit.id === id)) return false;
  return manaTiers(version).some(({ trait, count }) => {
    if (count > player.level || !UNIT[id].traits.includes(trait)) return false;
    const kinds = new Set(player.pieces
      .filter((piece) => UNIT[piece.defId].traits.includes(trait))
      .map((piece) => piece.defId));
    return !kinds.has(id) && kinds.size === count - 1;
  });
}
