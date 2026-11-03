import { UNIT, TRAITS } from "../data/units";
import {
  TRAIT_TIERS,
  AIRSEA_TRAIT_TIERS,
  TACTICS_TRAIT_TIERS,
  type TraitBonus,
} from "../data/traits";
import type { Piece, Trait, CombatVersion } from "./types";
import { insectCount } from "./progression";
export function synergies(
  pieces: Piece[],
  version: CombatVersion = "metamorph",
) {
  if (version === "metamorph") version = "fleet";
  const counts = new Map<Trait, number>();
  if (
    (version === "brood" || version === "airsea" || version === "fleet") &&
    insectCount(pieces)
  )
    counts.set("异虫", insectCount(pieces));
  for (const id of new Set(
    pieces.filter((p) => p.position !== null).map((p) => p.defId),
  ))
    for (const trait of UNIT[id].traits.filter(
      (trait) =>
        (!["不朽", "灵能", "猛禽", "陆行者"].includes(trait) ||
          version === "fleet") &&
        (version === "airsea" ||
          version === "fleet" ||
          !["空军", "海神", "攻城", "爆破"].includes(trait)) &&
        trait !== "异虫" &&
        (trait !== "异能" ||
          version === "brood" ||
          version === "airsea" ||
          version === "fleet") &&
        (version === "legions" ||
          version === "brood" ||
          version === "airsea" ||
          version === "fleet" ||
          !["召唤", "傀儡"].includes(trait)),
    ))
      counts.set(trait, (counts.get(trait) ?? 0) + 1);
  return [...counts]
    .map(([trait, count]) => {
      if (version === "legacy")
        return {
          trait,
          count,
          ...TRAITS[trait],
          active: count >= TRAITS[trait].threshold,
          tier: count >= TRAITS[trait].threshold ? 1 : 0,
          tiers: [TRAITS[trait].threshold],
          bonus: {} as TraitBonus,
        };
      const tiers = (
          version === "fleet"
            ? TRAIT_TIERS
            : version === "tactics"
              ? TACTICS_TRAIT_TIERS
              : AIRSEA_TRAIT_TIERS
        )[trait],
        tier = tiers.filter((t) => count >= t.count).length,
        current = tiers[tier - 1],
        next = tiers[tier];
      return {
        trait,
        count,
        tier,
        tiers: tiers.map((t) => t.count),
        threshold: next?.count ?? tiers.at(-1)!.count,
        description: current?.description ?? tiers[0].description,
        active: tier > 0,
        bonus: current?.bonus ?? {},
      };
    })
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        b.tier - a.tier ||
        b.count - a.count,
    );
}
export function traitBonuses(
  pieces: Piece[],
  version: CombatVersion = "metamorph",
) {
  const map = new Map<Trait, TraitBonus>();
  for (const s of synergies(pieces, version))
    if (s.active) map.set(s.trait, s.bonus);
  return map;
}
