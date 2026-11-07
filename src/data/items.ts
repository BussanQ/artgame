export interface ItemStats {
  attack: number;
  hp: number;
  armor: number;
  haste: number;
  mana: number;
  skillPower: number;
  lifesteal: number;
  magicResist: number;
  damageMana: number;
}
export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  stats: Partial<ItemStats>;
  recipe?: [string, string];
  effect?: "resonance" | "call" | "fog";
}
/** S34 client cards; opening delay, recipes and summon profile are local adaptations. */
export const EQUIPMENT_SKILLS={opening:4,resonance:{cooldown:40,damage:500},call:{cooldown:120}} as const;
export const WHALE_EYE={cooldown:180,delay:24,damage:200} as const;
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
  {
    id:"wolf-fang",name:"狼牙坠",icon:"◈",stats:{lifesteal:0.1},recipe:["fang","crystal"],effect:"call",
    description:"普攻吸血+10%。自动技能·呼号：开战1秒后、此后每30秒在相邻空格召唤一只呼号傀儡。固定380生命、48攻击、3甲、0.75秒普攻；不继承持有者星级、装备或法强，享受团队召唤与全军增益。无空格时等待；控制期间暂停。同名装备只触发一套召唤，基础吸血仍可叠加。",
  },
  {
    id:"soul-crystal",name:"灵魂之晶",icon:"◆",stats:{skillPower:0.3},recipe:["crystal","coil"],effect:"resonance",
    description:"技能强度+30%。自动技能·鞭笞：开战1秒后、此后每10秒随机对一名可见敌人造成500基础法术伤害，不随星级或法强变化，仍计算魔抗和护盾。无需能量，不占用普攻或本体引导；控制期间暂停，无可见敌人时等待。同名装备共享一套触发与冷却，基础技能强度仍可叠加。",
  },
  {
    id:"whale-eye",name:"巨鲸之眼",icon:"◉",stats:{attack:30,damageMana:1},recipe:["blade","core"],effect:"fog",
    description:"攻击+30，普攻造成生命伤害时的能量回复+100%，每次普攻动作最多一次；不为无能量棋子回能，不放大受击或辅助供能。自动技能·海雾：开战1秒后释放，6秒后对全场其他存活敌人造成200基础法术伤害，覆盖隐形，计算魔抗和护盾，不随星级或法强变化。释放后即使持有人死亡或受控也会引爆，不延长已结束战斗；按释放时阵营辨敌，45秒冷却。释放前受控时等待。同名技能不叠加，基础攻击与回能加成可叠加；召唤物不继承本装备，刑傀不继承海雾和额外回能。",
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
    damageMana: 0,
  };
  for (const id of items)
    for (const [key, value] of Object.entries(ITEM[id]?.stats ?? {}))
      result[key as keyof ItemStats] += value;
  result.haste = Math.min(0.55, result.haste);
  result.lifesteal = Math.min(0.6, result.lifesteal);
  result.magicResist = Math.min(0.5, result.magicResist);
  return result;
}
