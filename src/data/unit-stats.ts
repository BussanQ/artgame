import {
  CURRENT_COMBAT_VERSION,
  hasAmbushRules,
  hasLineageRules,
  hasAuroraRules,
  hasQiRules,
  type CombatVersion,
  type UnitDef,
} from "../engine/types";
import { UNIT } from "./units";

/** Preserve the pre-0.45 professions for in-flight battles and all historical reports. */
const previousTraits: Record<string, UnitDef["traits"]> = {
  chariot: ["装甲", "狙击", "攻城"],
  titan: ["装甲", "护卫", "爆破"],
  staffthrall: ["傀儡", "先锋"],
  thunderlord: ["灵能", "爆破"],
  wolf: ["野兽", "刺杀", "召唤"],
  bonedragon: ["不朽", "爆破", "猛禽"],
  vine: ["不朽", "护卫"],
  monk: ["熊猫", "护卫"],
};
const previousDefinitions: Record<string, UnitDef> = Object.fromEntries(
  Object.entries(previousTraits).map(([id, traits]) => [
    id,
    { ...UNIT[id], traits },
  ]),
);

const oldPangolin: UnitDef = {
  ...UNIT.pangolin,
  traits: ["野兽", "先锋"],
  hp: 720,
  attack: 42,
  armor: 6,
  interval: 3,
  initialMana: 0,
  skill: "破阵冲击",
};
const oldSkycrab: UnitDef = { ...UNIT.skycrab, skill: "聚能狙杀" };
const oldArhat: UnitDef = {
  ...UNIT.arhat,
  hp: 750,
  attack: 60,
  armor: 3,
  range: 4,
  interval: 4,
  skill: "破妄真言",
};
const oldSkytoad: UnitDef = {
  ...UNIT.skytoad,
  cost: 4,
  hp: 1250,
  attack: 55,
  range: 2,
  interval: 4,
  magicResist: undefined,
  regeneration: undefined,
  skill: "吞云噬体",
};
/** Keep the original portrait available to in-flight battles and historical reports. */
export function unitSprite(
  id: string,
  version: CombatVersion = CURRENT_COMBAT_VERSION,
) {
  if (id === "arhat" && hasQiRules(version)) return "arhat-qi";
  return id === "skycrab" && hasAuroraRules(version) ? "skycrab-aurora" : id;
}
/** Resolve changed definitions before building a historical battle or its information panels. */
export function unitDefinition(
  id: string,
  version: CombatVersion = CURRENT_COMBAT_VERSION,
): UnitDef {
  if (id === "pangolin" && !hasAmbushRules(version)) return oldPangolin;
  if (id === "arhat" && !hasQiRules(version)) return oldArhat;
  if (id === "skytoad" && version !== "taotie") return oldSkytoad;
  if (id === "skycrab" && !hasAuroraRules(version)) return oldSkycrab;
  return !hasLineageRules(version) && previousDefinitions[id]
    ? previousDefinitions[id]
    : UNIT[id];
}
/** Permanent star growth, excluding gear and battle-only formations. */
export function unitArmor(
  unit: Pick<UnitDef, "armor" | "armorPerStar">,
  star: number,
) {
  return unit.armor + (unit.armorPerStar ?? 0) * (star - 1);
}
