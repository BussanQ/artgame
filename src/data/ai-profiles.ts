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
    traits: ["步兵", "护卫", "陆行者"],
    reserve: 5,
    description: "稳健攒息，依靠步兵与护盾前排保护射手",
  },
  {
    name: "幽影猎杀",
    traits: ["刺杀", "野兽"],
    reserve: -10,
    description: "积极追星，以刺杀与狼群压制后排",
  },
  {
    name: "荒原兽群",
    traits: ["野兽", "先锋", "猛禽"],
    reserve: 0,
    description: "野兽与猛禽协同，先锋恢复支撑突袭与持续输出",
  },
  {
    name: "空海舰队",
    traits: ["空军", "海神", "攻城"],
    reserve: 10,
    description: "积累空海羁绊，以维修强化主力，寻找方舟和电蛟输出核心",
  },
  {
    name: "熊猫宗师",
    traits: ["熊猫", "护卫", "支援"],
    reserve: 5,
    description: "围绕初始能量、治疗和控制构筑",
  },
  {
    name: "异虫蜂群",
    traits: ["异虫", "异能", "狙击"],
    reserve: 0,
    description: "收集异虫加速升星，以魅惑和能量压制保护杀人蜂",
  },
  {
    name: "灵能不朽",
    traits: ["灵能", "不朽", "召唤"],
    reserve: 5,
    description: "以不朽前排延续反伤，童子充能带动雷法与召唤",
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
