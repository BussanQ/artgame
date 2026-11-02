import { COMPONENTS, ITEM, ITEMS } from "../data/items";
import { UNIT } from "../data/units";
import { SKILLS } from "../data/skills";
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
  version: CombatVersion = "signature",
): number {
  const s = ITEM[id].stats,
    u = UNIT[piece.defId],
    tank = u.traits.includes("护卫") || u.traits.includes("先锋"),
    caster = SKILLS[u.id].damageType === "magic" || SKILLS[u.id].healRatio > 0;
  return (
    (s.attack ?? 0) * (u.range > 1 ? 2 : 1) +
    (s.hp ?? 0) * (tank ? 0.2 : 0.08) +
    (s.armor ?? 0) * (tank ? 10 : 4) +
    (s.haste ?? 0) * u.attack * 4 +
    (s.lifesteal ?? 0) * u.attack * 3 +
    (s.skillPower ?? 0) *
      (version === "signature" && u.id === "turtle" ? 0 : caster ? 300 : 100) +
    (s.mana ?? 0) *
      (version === "signature" && ["cavalry", "turtle", "tiger"].includes(u.id)
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
      .filter((x) => x.position !== null && (x.items?.length ?? 0) < 3)
      .sort(
        (a, b) =>
          itemScore(b, p.inventory[index], g.combatVersion) * b.star -
            itemScore(a, p.inventory[index], g.combatVersion) * a.star ||
          a.uid - b.uid,
      );
    if (candidates[0]) equip(g, p, index, candidates[0].uid);
  }
}
