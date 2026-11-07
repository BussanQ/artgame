import {
  CURRENT_COMBAT_VERSION,
  hasBulwarkRules,
  hasSpiritWardRules,
  hasTortoiseRules,
  hasSiegeRules,
  hasInfernoRules,
  hasMendingRules,
  hasFormlessRules,
  hasDreamRules,
  hasDetonationRules,
  hasHiveRules,
  hasGazeRules,
  hasRifleRules,
  hasThornBindRules,
  hasBoneBlastRules,
  hasWildfireRules,
  hasTornadoRules,
  hasWarcryRules,
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
import {RIFLE,HIVE} from "./skills";

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

const oldChariot: UnitDef = {...UNIT.chariot,cost:2,hp:620,attack:100,armor:5,range:4,interval:5,initialMana:undefined,skill:"集束轰击"};
const oldVajra:UnitDef={...UNIT.vajra,cost:2,hp:900,attack:42,interval:4,initialMana:25,skill:"镇岳重击"};
const oldRepair:UnitDef={...UNIT.repair,hp:500,attack:24,armor:2,range:3,interval:4,initialMana:50,skill:"战地维修"};
const oldGhost:UnitDef={...UNIT.ghostjet,hp:640,attack:90,armor:3,range:3,interval:3,initialMana:undefined,regeneration:undefined,skill:"幽影迁跃"};
const oldSpider:UnitDef={...UNIT.spider,hp:650,attack:45,armor:3,interval:4,skill:"迷梦蛛丝"};
const oldBlastBug:UnitDef={...UNIT.blastbug,hp:700,armor:4,range:1,interval:4,skill:"裂变殉爆",color:"#e6a35c"};
const oldChariotSniper: UnitDef = {...oldChariot,traits:previousTraits.chariot};
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
const oldLion: UnitDef = {
  ...UNIT.lion, cost: 2, hp: 950, attack: 52, armor: 5, range: 1, interval: 3, skill: "怒吼",
};
const oldWinddragon: UnitDef = {
  ...UNIT.winddragon, hp: 1100, attack: 75, range: 3, interval: 4,
  initialMana: 50, magicResist: undefined, skill: "游龙卷风",
};
const oldPhoenix: UnitDef = {
  ...UNIT.phoenix, cost: 4, hp: 1000, attack: 85, armor: 4, range: 3, interval: 4,
};
const oldBoneDragon: UnitDef = {
  ...UNIT.bonedragon, hp: 1000, attack: 88, armor: 5, range: 3, interval: 4,
  skill: "冥霜吐息",
};
const oldBoneDragonBlast: UnitDef = { ...oldBoneDragon, traits: previousTraits.bonedragon };
const boneDragonV065: UnitDef = { ...UNIT.bonedragon, interval: 4.8 };
const oldVine: UnitDef = { ...UNIT.vine, hp:820, attack:44, interval:4, skill:"枯藤缠身" };
const oldVineGuard: UnitDef = { ...oldVine, traits:previousTraits.vine };
const oldInfantry:UnitDef={...UNIT.infantry,hp:480,attack:58,armor:2,interval:3,skill:"精准射击"};
const oldEyeBug:UnitDef={...UNIT.eyebug,hp:450,attack:28,armor:1,range:3,interval:4};
const oldWasp:UnitDef={...UNIT.wasp,hp:850,attack:100,armor:3,interval:3,skill:"毒针风暴"};
const oldGuard:UnitDef={...UNIT.guard,cost:1,hp:800,attack:36,armor:7,skill:"震荡重击"};
const oldDeer:UnitDef={...UNIT.deer,cost:2,hp:650,attack:38,armor:2,range:3,interval:4};
const oldTurtle:UnitDef={...UNIT.turtle,cost:4,traits:["野兽","护卫"],attack:62,armor:9,interval:4,initialMana:100,skill:"玄甲"};
/** Keep the original portrait available to in-flight battles and historical reports. */
export function unitSprite(
  id: string,
  version: CombatVersion = CURRENT_COMBAT_VERSION,
  star = 1,
) {
  if (id === "blastbug" && hasDetonationRules(version)) return "blastbug-detonation-v082";
  if (id === "ghostjet" && hasFormlessRules(version)) return "ghostjet-formless-v077";
  if (id === "vajra" && hasInfernoRules(version)) return "vajra-inferno-v075";
  if (id === "repair" && hasMendingRules(version)) return "repair-mending-v076";
  if (id === "wasp" && hasHiveRules(version)) return "wasp-hive";
  if (id === "infantry" && hasRifleRules(version)) return "infantry-rifle";
  if (id === "bonedragon" && hasBoneBlastRules(version)) return "bonedragon-boneblast";
  if (id === "phoenix" && hasWildfireRules(version))
    return star >= 3 ? "phoenix-wildfire-gold" : star === 2 ? "phoenix" : "phoenix-wildfire-blue";
  if (id === "winddragon" && hasTornadoRules(version)) return "winddragon-tornado";
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
  if (id === "blastbug" && !hasDetonationRules(version)) return oldBlastBug;
  if (id === "spider" && !hasDreamRules(version)) return oldSpider;
  if (id === "ghostjet" && !hasFormlessRules(version)) return oldGhost;
  if (id === "vajra" && !hasInfernoRules(version)) return oldVajra;
  if (id === "repair" && !hasMendingRules(version)) return oldRepair;
  if (id === "turtle" && !hasTortoiseRules(version)) return oldTurtle;
  if (id === "deer" && !hasSpiritWardRules(version)) return oldDeer;
  if (id === "guard" && !hasBulwarkRules(version)) return oldGuard;
  if (id === "wasp" && !hasHiveRules(version)) return oldWasp;
  if (id === "eyebug" && !hasGazeRules(version)) return oldEyeBug;
  if (id === "infantry" && !hasRifleRules(version)) return oldInfantry;
  if (id === "vine" && !hasThornBindRules(version))
    return hasLineageRules(version) ? oldVine : oldVineGuard;
  if (id === "bonedragon" && hasBoneBlastRules(version) && !hasThornBindRules(version)) return boneDragonV065;
  if (id === "bonedragon" && !hasBoneBlastRules(version))
    return hasLineageRules(version) ? oldBoneDragon : oldBoneDragonBlast;
  if (id === "phoenix" && !hasWildfireRules(version)) return oldPhoenix;
  if (id === "winddragon" && !hasTornadoRules(version)) return oldWinddragon;
  if (id === "lion" && !hasWarcryRules(version)) return oldLion;
  if (id === "titan" && !hasTerminatorRules(version)) return hasLineageRules(version) ? oldTitan : oldTitanGuard;
  if (id === "ark" && !hasBombardmentRules(version)) return oldArk;
  if (id === "monk" && !hasSecretOrbRules(version)) return hasLineageRules(version) ? oldMonk : oldMonkGuard;
  if (id === "panda" && !hasShurikenRules(version)) return oldPanda;
  if (id === "master" && !hasWushiRules(version)) return oldMaster;
  if (id === "treant" && !hasJungleRules(version)) return oldTreant;
  if (id === "stormcaller" && !hasStormRules(version)) return oldStormcaller;
  if (id === "chariot" && !hasSiegeRules(version)) return hasLineageRules(version)?oldChariot:oldChariotSniper;
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
export function unitMinimumAttackInterval(unit:Pick<UnitDef,"id">,version:CombatVersion=CURRENT_COMBAT_VERSION){
  return unit.id==="wasp"&&hasHiveRules(version)?HIVE.needlesPerAttack*HIVE.needleInterval:1;
}
export function unitAttackInterval(unit:Pick<UnitDef,"id"|"interval">,star:number,version:CombatVersion=CURRENT_COMBAT_VERSION){
  return unit.id==="infantry"&&hasRifleRules(version)?(RIFLE.intervals[star-1]??unit.interval):unit.interval;
}
export function unitArmor(
  unit: Pick<UnitDef, "armor" | "armorPerStar">,
  star: number,
) {
  return unit.armor + (unit.armorPerStar ?? 0) * (star - 1);
}
