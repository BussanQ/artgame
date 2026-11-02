import type { Difficulty, Trait } from "../engine/types";
export interface AiProfile {
  name: string;
  traits: Trait[];
  reserve: number;
  description: string;
}
export const AI_PROFILES: AiProfile[] = [
  { name: "自由指挥", traits: [], reserve: 0, description: "自行决定构筑方向" },
  {
    name: "步兵防线",
    traits: ["步兵", "护卫"],
    reserve: 5,
    description: "稳健攒息，依靠步兵与护盾前排保护射手",
  },
  {
    name: "幽影猎杀",
    traits: ["刺杀", "野兽"],
    reserve: -10,
    description: "积极追星，以突袭与吸血压制后排",
  },
  {
    name: "荒原兽群",
    traits: ["野兽", "先锋"],
    reserve: 0,
    description: "优先野兽攻速与先锋恢复，追求持续近战",
  },
  {
    name: "钢铁火线",
    traits: ["装甲", "狙击", "骑兵"],
    reserve: 10,
    description: "储蓄升级，寻找重装与高费远程核心",
  },
  {
    name: "熊猫宗师",
    traits: ["熊猫", "护卫", "支援"],
    reserve: 5,
    description: "围绕初始能量、治疗和控制构筑",
  },
  {
    name: "精准齐射",
    traits: ["狙击", "步兵"],
    reserve: 0,
    description: "组成射手阵线，以前排和站位保护火力",
  },
  {
    name: "不破铁壁",
    traits: ["护卫", "装甲"],
    reserve: 5,
    description: "重视生存装备，以护盾和控制消耗对手",
  },
];
export const DIFFICULTIES: Record<
  Difficulty,
  {
    name: string;
    description: string;
    rolls: number;
    beam: number;
    levelDelay: number;
    xpPurchases: number;
  }
> = {
  relaxed: {
    name: "休闲",
    description: "AI 简单选阵、少量刷新，只靠自然经验升级，适合练习构筑。",
    rolls: 1,
    beam: 8,
    levelDelay: 3,
    xpPurchases: 0,
  },
  standard: {
    name: "标准",
    description: "AI 会攒息、追星、组成羁绊并在低血量时投入金币。",
    rolls: 2,
    beam: 20,
    levelDelay: 0,
    xpPurchases: 4,
  },
  veteran: {
    name: "挑战",
    description:
      "AI 会试算当前可见对手，比较阵容与分散/抱团站位；不增加金币或战斗属性。",
    rolls: 4,
    beam: 36,
    levelDelay: -1,
    xpPurchases: 4,
  },
};
