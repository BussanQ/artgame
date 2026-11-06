import {
  CURRENT_COMBAT_VERSION,
  hasTerminatorRules,
  hasBombardmentRules,
  hasShurikenRules,
  hasSecretOrbRules,
  hasAmbushRules,
  hasLineageRules,
  hasAuroraRules,
  hasQiRules,
  hasTaotieRules,
  hasTarRules,
  hasLightningRules,
  hasGospelRules,
  hasStormRules,
  hasJungleRules,
  hasWushiRules,
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
const oldMotorcycle: UnitDef = {
  ...UNIT.motorcycle,
  hp: 750,
  attack: 72,
  interval: 4,
  skill: "三连发",
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
const oldThunderlord: UnitDef = {
  ...UNIT.thunderlord,
  cost: 5,
  hp: 1100,
  attack: 100,
  range: 4,
  interval: 4,
  initialMana: 50,
  skill: "九霄连雷",
};
const oldThunderlordBlast: UnitDef = {
  ...oldThunderlord,
  traits: previousTraits.thunderlord,
};
const oldAcolyte: UnitDef = {
  ...UNIT.acolyte,
  cost: 1,
  hp: 480,
  attack: 24,
  armor: 2,
  range: 3,
  interval: 4,
  initialMana: 50,
  skill: "灵珠充能",
};
const oldStormcaller: UnitDef = {
  ...UNIT.stormcaller, cost: 3, hp: 700, attack: 65, armor: 3,
  range: 3, interval: 4, skill: "雷电法球",
};
const oldTreant: UnitDef = {
  ...UNIT.treant, hp: 1550, attack: 90, armor: 7, interval: 4,
  regeneration: undefined, skill: "古木震荡",
};
const oldMaster: UnitDef = {
  ...UNIT.master, cost: 4, hp: 1300, attack: 95, armor: 6, interval: 3,
  initialMana: undefined, skill: "横扫",
};
const oldPanda: UnitDef = {
  ...UNIT.panda, cost: 1, hp: 530, attack: 66, armor: 2, range: 1, interval: 2,
  initialMana: undefined, skill: "影袭",
};
const oldMonk: UnitDef = {
  ...UNIT.monk, cost: 3, hp: 1100, attack: 60, armor: 6, range: 1, interval: 3,
  initialMana: undefined, regeneration: undefined, skill: "气劲",
};
const oldMonkGuard: UnitDef = { ...oldMonk, traits: previousTraits.monk };
const oldArk: UnitDef = {
  ...UNIT.ark, hp: 1050, attack: 100, range: 4, interval: 4,
  skill: "虚空重炮",
};
const oldTitan: UnitDef = {
  ...UNIT.titan, hp: 1700, attack: 120, armor: 10, range: 1, interval: 4,
  skill: "天坠",
};
const oldTitanGuard: UnitDef = { ...oldTitan, traits: previousTraits.titan };
/** Keep the original portrait available to in-flight battles and historical reports. */
export function unitSprite(
  id: string,
  version: CombatVersion = CURRENT_COMBAT_VERSION,
) {
  if (id === "titan" && hasTerminatorRules(version)) return "titan-terminator";
  if (id === "monk" && hasSecretOrbRules(version)) return "monk-orb";
  if (id === "panda" && hasShurikenRules(version)) return "panda-shuriken";
  if (id === "treant" && hasJungleRules(version)) return "treant-jungle";
  if (id === "stormcaller" && hasStormRules(version)) return "stormcaller-thunderstorm";
  if (id === "acolyte" && hasGospelRules(version)) return "acolyte-gospel";
  if (id === "arhat" && hasQiRules(version)) return "arhat-qi";
  return id === "skycrab" && hasAuroraRules(version) ? "skycrab-aurora" : id;
}
/** Resolve changed definitions before building a historical battle or its information panels. */
export function unitDefinition(
  id: string,
  version: CombatVersion = CURRENT_COMBAT_VERSION,
): UnitDef {
  if (id === "titan" && !hasTerminatorRules(version)) return hasLineageRules(version) ? oldTitan : oldTitanGuard;
  if (id === "ark" && !hasBombardmentRules(version)) return oldArk;
  if (id === "monk" && !hasSecretOrbRules(version)) return hasLineageRules(version) ? oldMonk : oldMonkGuard;
  if (id === "panda" && !hasShurikenRules(version)) return oldPanda;
  if (id === "master" && !hasWushiRules(version)) return oldMaster;
  if (id === "treant" && !hasJungleRules(version)) return oldTreant;
  if (id === "stormcaller" && !hasStormRules(version)) return oldStormcaller;
  if (id === "acolyte" && !hasGospelRules(version)) return oldAcolyte;
  if (id === "thunderlord" && !hasLightningRules(version))
    return hasLineageRules(version) ? oldThunderlord : oldThunderlordBlast;
  if (id === "pangolin" && !hasAmbushRules(version)) return oldPangolin;
  if (id === "arhat" && !hasQiRules(version)) return oldArhat;
  if (id === "motorcycle" && !hasTarRules(version)) return oldMotorcycle;
  if (id === "skytoad" && !hasTaotieRules(version)) return oldSkytoad;
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
