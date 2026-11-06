import {
  CURRENT_COMBAT_VERSION,
  hasAmbushRules,
  hasLightningRules,
  hasGospelRules,
  hasWushiRules,
  hasShurikenRules,
  hasRifleRules,
  hasGazeRules,
  hasHiveRules,
  hasBulwarkRules,
  hasSpiritWardRules,
} from "./types";
import { COMPONENTS, ITEM, ITEMS } from "../data/items";
import { UNIT } from "../data/units";
import { unitDefinition,unitAttackInterval } from "../data/unit-stats";
import {
  BLADE_CRITICAL,
  STAFF_GALE,
  SKILLS,
  THUNDER_CHAIN,
} from "../data/skills";
import { random } from "./random";
import type { Game, Player, Piece, CombatVersion } from "./types";

export function equip(g: Game, p: Player, index: number, uid: number): boolean {
  const piece = p.pieces.find((x) => x.uid === uid),
    id = p.inventory[index];
  if (
    g.phase !== "prepare" ||
    !piece ||
    !id ||
    (piece.items?.length ?? 0) >= 3 ||
    !Number.isInteger(index) ||
    index < 0
  )
    return false;
  (piece.items ??= []).push(id);
  p.inventory.splice(index, 1);
  return true;
}
export function unequip(
  g: Game,
  p: Player,
  uid: number,
  index: number,
): boolean {
  const piece = p.pieces.find((x) => x.uid === uid),
    id = piece?.items?.[index];
  if (
    g.phase !== "prepare" ||
    !piece ||
    !id ||
    !Number.isInteger(index) ||
    index < 0
  )
    return false;
  p.inventory.push(id);
  piece.items!.splice(index, 1);
  return true;
}
export function canCraft(p: Player, id: string): boolean {
  const recipe = ITEM[id]?.recipe;
  if (!recipe) return false;
  const available = [...p.inventory];
  for (const part of recipe) {
    const index = available.indexOf(part);
    if (index < 0) return false;
    available.splice(index, 1);
  }
  return true;
}
export function craft(g: Game, p: Player, id: string): boolean {
  if (g.phase !== "prepare" || !canCraft(p, id)) return false;
  for (const part of ITEM[id].recipe!)
    p.inventory.splice(p.inventory.indexOf(part), 1);
  p.inventory.push(id);
  return true;
}
export function rewardChoices(g: Game, count: number): string[] {
  const remaining = [...COMPONENTS],
    choices: string[] = [];
  while (choices.length < count && remaining.length)
    choices.push(
      remaining.splice(Math.floor(random(g) * remaining.length), 1)[0],
    );
  return choices;
}
export function claimReward(g: Game, index: number): boolean {
  const reward = g.reward,
    id = reward?.choices[index];
  if (
    g.phase !== "result" ||
    !reward ||
    reward.round !== g.round ||
    !id ||
    !Number.isInteger(index) ||
    index < 0
  )
    return false;
  g.players[0].inventory.push(id);
  const report = g.history.at(-1);
  if (report) report.reward = id;
  g.reward = null;
  g.message = `已获得 ${ITEM[id].name}，准备阶段可装备或合成。`;
  return true;
}
export function itemScore(
  piece: Piece,
  id: string,
  version: CombatVersion = CURRENT_COMBAT_VERSION,
): number {
  const wushi = hasWushiRules(version) && piece.defId === "master";
  const lightning = hasLightningRules(version) && piece.defId === "thunderlord";
  const gospel = hasGospelRules(version) && piece.defId === "acolyte";
  const rifle=hasRifleRules(version)&&piece.defId==="infantry";
  const gaze=hasGazeRules(version)&&piece.defId==="eyebug";
  const bulwark=hasBulwarkRules(version)&&piece.defId==="guard";
  const spiritWard=hasSpiritWardRules(version)&&piece.defId==="deer";
  const expectedAttack = hasHiveRules(version)&&piece.defId==="wasp" ? 2.5 : rifle ? 4/unitAttackInterval(unitDefinition(piece.defId,version),piece.star,version) : lightning
    ? 1 +
      Math.min(
        0.6,
        Array.from(
          { length: THUNDER_CHAIN.hits[piece.star - 1] - 1 },
          (_, i) => THUNDER_CHAIN.retention ** (i + 1),
        ).reduce((a, b) => a + b, 0) * 0.7,
      )
    : piece.defId === "bladethrall"
      ? 1 +
        BLADE_CRITICAL.chance * (BLADE_CRITICAL.multiplier[piece.star - 1] - 1)
      : piece.defId === "staffthrall"
        ? 1 + Math.min(0.45, STAFF_GALE.speedPerStack[piece.star - 1] * 3)
        : 1;
  const s = ITEM[id].stats,
    u = unitDefinition(piece.defId, version),
    tank =
      u.traits.includes("护卫") ||
      u.traits.includes("先锋") ||
      u.id === "blastbug" ||
      u.id === "irondog" ||
      u.id === "ironape",
    caster =
      (hasShurikenRules(version) && u.id === "panda") ||
      [
        "wolf",
        "adept",
        "shark",
        "spider",
        "repair",
        "whale",
        "medic",
        "ironrooster",
        "venombeast",
      ].includes(u.id) ||
      (hasAmbushRules(version) && u.id === "pangolin") ||
      SKILLS[u.id].damageType === "magic" ||
      SKILLS[u.id].healRatio > 0;
  return (
    (s.attack ?? 0) * (u.range > 1 ? 2 : 1) * expectedAttack +
    (s.hp ?? 0) * (gospel ? 0.2 : tank ? 0.2 : 0.08) +
    (s.armor ?? 0) * (gospel ? 8 : tank ? 10 : 4) +
    (s.haste ?? 0) * u.attack * 4 * expectedAttack +
    (s.lifesteal ?? 0) * u.attack * 3 * expectedAttack +
    (s.skillPower ?? 0) *
      (lightning || gospel || wushi || rifle || gaze || bulwark || spiritWard
        ? 0
        : (version === "signature" ||
              version === "summons" ||
              version === "legions" ||
              version === "brood" ||
              version === "airsea" ||
              version === "fleet" ||
              version === "metamorph" ||
              version === "infantry" ||
              version === "armored" ||
              version === "puppets" ||
              version === "wildfront" ||
              hasAmbushRules(version)) &&
            [
              "turtle",
              "birdrider",
              "bladethrall",
              "staffthrall",
              "ironrooster",
              "venombeast",
            ].includes(u.id)
          ? 0
          : caster
            ? 300
            : 100) +
    (s.mana ?? 0) *
      (lightning || gospel || rifle
        ? 0
        : (version === "signature" ||
              version === "summons" ||
              version === "legions" ||
              version === "brood" ||
              version === "airsea" ||
              version === "fleet" ||
              version === "metamorph" ||
              version === "infantry" ||
              version === "armored" ||
              version === "puppets" ||
              version === "wildfront" ||
              hasAmbushRules(version)) &&
            [
              "cavalry",
              "turtle",
              "tiger",
              "blastbug",
              "birdrider",
              "bladethrall",
              "staffthrall",
            ].includes(u.id)
          ? 0
          : caster
            ? 2
            : 1) +
    (s.magicResist ?? 0) * 200
  );
}
export function equipBot(g: Game, p: Player) {
  // Rebalance between rounds, freeing items on reserves before choosing carriers.
  for (const piece of p.pieces) {
    p.inventory.push(...(piece.items ?? []));
    piece.items = [];
  }
  for (const item of ITEMS.filter((i) => i.recipe))
    while (canCraft(p, item.id)) craft(g, p, item.id);
  for (let index = p.inventory.length - 1; index >= 0; index--) {
    const candidates = p.pieces
      .filter((x) => x.position !== null && (x.items?.length ?? 0) < 3 &&
        (!hasRifleRules(g.combatVersion)||itemScore(x,p.inventory[index],g.combatVersion)>0))
      .sort(
        (a, b) =>
          itemScore(b, p.inventory[index], g.combatVersion) * b.star -
            itemScore(a, p.inventory[index], g.combatVersion) * a.star ||
          a.uid - b.uid,
      );
    if (candidates[0]) equip(g, p, index, candidates[0].uid);
  }
}
