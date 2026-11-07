import { unitDefinition } from "./unit-stats";
import { CURRENT_COMBAT_VERSION, hasTortoiseRules, type CombatVersion, type Piece } from "../engine/types";

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
/** Species substitutions must not invalidate a running match's bans or existing army. */
export function catalogDefinitionVersion(game:CatalogContext,id:string):CombatVersion{
  const version=game.combatVersion??CURRENT_COMBAT_VERSION;
  return id==="turtle"&&hasTortoiseRules(version)&&!hasTortoiseRules(catalogVersion(game))?"spirit-ward":version;
}
export function pinCatalogDefinitions(game:CatalogContext,pieces:Piece[]){
  for(const piece of pieces){
    const version=catalogDefinitionVersion(game,piece.defId);
    if(version!==(game.combatVersion??CURRENT_COMBAT_VERSION))piece.definitionVersion=version;
  }
}
export function catalogUnit(game: CatalogContext, id: string) {
  const unit = unitDefinition(id, catalogDefinitionVersion(game,id));
  const cost = catalogCost(game, id);
  return unit.cost === cost ? unit : { ...unit, cost };
}
