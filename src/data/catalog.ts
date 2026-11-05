import { unitDefinition } from "./unit-stats";
import { CURRENT_COMBAT_VERSION, type CombatVersion } from "../engine/types";

/** Prices and pool tiers stay fixed for a match, independently of battle upgrades. */
export interface CatalogContext {
  catalogVersion?: CombatVersion;
  combatVersion?: CombatVersion;
}
export const catalogVersion = (game: CatalogContext) =>
  game.catalogVersion ?? game.combatVersion ?? CURRENT_COMBAT_VERSION;
export const unitCost = (
  id: string,
  version: CombatVersion = CURRENT_COMBAT_VERSION,
) => unitDefinition(id, version).cost;
export const catalogCost = (game: CatalogContext, id: string) =>
  unitCost(id, catalogVersion(game));
export function catalogUnit(game: CatalogContext, id: string) {
  const unit = unitDefinition(id, game.combatVersion ?? CURRENT_COMBAT_VERSION);
  const cost = catalogCost(game, id);
  return unit.cost === cost ? unit : { ...unit, cost };
}
