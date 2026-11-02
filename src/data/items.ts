export interface ItemStats {
  attack: number;
  hp: number;
  armor: number;
  haste: number;
  mana: number;
  skillPower: number;
  lifesteal: number;
  magicResist: number;
}
export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  stats: Partial<ItemStats>;
  recipe?: [string, string];
}
export const ITEMS: ItemDef[] = [
  {
    id: "blade",
    name: "合金刃",
    icon: "⚔",
    description: "攻击 +18",
    stats: { attack: 18 },
  },
  {
    id: "plate",
    name: "装甲片",
    icon: "⬡",
    description: "护甲 +3",
    stats: { armor: 3 },
  },
  {
    id: "core",
    name: "生命核心",
    icon: "♥",
    description: "生命 +150",
    stats: { hp: 150 },
  },
  {
    id: "coil",
    name: "加速线圈",
    icon: "ϟ",
    description: "攻击间隔缩短 8%",
    stats: { haste: 0.08 },
  },
  {
    id: "crystal",
    name: "灵能晶体",
    icon: "◆",
    description: "初始能量 +15，技能强度 +10%",
    stats: { mana: 15, skillPower: 0.1 },
  },
  {
    id: "fang",
    name: "汲能獠牙",
    icon: "◈",
    description: "普攻吸血 8%",
    stats: { lifesteal: 0.08 },
  },
  {
    id: "warblade",
    name: "破军战刃",
    icon: "⚔",
    description: "攻击 +50",
    stats: { attack: 50 },
    recipe: ["blade", "blade"],
  },
  {
    id: "fortress",
    name: "堡垒甲",
    icon: "⬡",
    description: "护甲 +9，法术减伤 +10%",
    stats: { armor: 9, magicResist: 0.1 },
    recipe: ["plate", "plate"],
  },
  {
    id: "heart",
    name: "不屈之心",
    icon: "♥",
    description: "生命 +450",
    stats: { hp: 450 },
    recipe: ["core", "core"],
  },
  {
    id: "overdrive",
    name: "超频引擎",
    icon: "ϟ",
    description: "攻击间隔缩短 25%",
    stats: { haste: 0.25 },
    recipe: ["coil", "coil"],
  },
  {
    id: "staff",
    name: "聚能法杖",
    icon: "◆",
    description: "初始能量 +40，技能强度 +30%",
    stats: { mana: 40, skillPower: 0.3 },
    recipe: ["crystal", "crystal"],
  },
  {
    id: "siphon",
    name: "吞噬之牙",
    icon: "◈",
    description: "普攻吸血 25%，攻击 +10",
    stats: { lifesteal: 0.25, attack: 10 },
    recipe: ["fang", "fang"],
  },
  {
    id: "bloodblade",
    name: "饮血战刃",
    icon: "⚔",
    description: "攻击 +30，普攻吸血 18%",
    stats: { attack: 30, lifesteal: 0.18 },
    recipe: ["blade", "fang"],
  },
  {
    id: "aegis",
    name: "守护壁垒",
    icon: "⬡",
    description: "生命 +250，护甲 +5",
    stats: { hp: 250, armor: 5 },
    recipe: ["plate", "core"],
  },
  {
    id: "rageblade",
    name: "疾风利刃",
    icon: "ϟ",
    description: "攻击 +25，攻击间隔缩短 15%",
    stats: { attack: 25, haste: 0.15 },
    recipe: ["blade", "coil"],
  },
  {
    id: "sage",
    name: "贤者核心",
    icon: "◆",
    description: "生命 +220，技能强度 +20%，初始能量 +20",
    stats: { hp: 220, skillPower: 0.2, mana: 20 },
    recipe: ["crystal", "core"],
  },
];
export const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<
  string,
  ItemDef
>;
export const COMPONENTS = ITEMS.filter((i) => !i.recipe).map((i) => i.id);
export function equipmentStats(items: string[] = []): ItemStats {
  const result: ItemStats = {
    attack: 0,
    hp: 0,
    armor: 0,
    haste: 0,
    mana: 0,
    skillPower: 0,
    lifesteal: 0,
    magicResist: 0,
  };
  for (const id of items)
    for (const [key, value] of Object.entries(ITEM[id]?.stats ?? {}))
      result[key as keyof ItemStats] += value;
  result.haste = Math.min(0.55, result.haste);
  result.lifesteal = Math.min(0.6, result.lifesteal);
  result.magicResist = Math.min(0.5, result.magicResist);
  return result;
}
