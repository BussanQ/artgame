import type {
  Difficulty,
  Trait,
  Player,
  AiProfileId,
  UnitDef,
} from "../engine/types";
import { random } from "../engine/random";
export interface AiProfile {
  id: AiProfileId | "free";
  name: string;
  traits: Trait[];
  reserve: number;
  description: string;
}
export const AI_PROFILES: AiProfile[] = [
  {
    id: "free",
    name: "自由指挥",
    traits: [],
    reserve: 0,
    description: "自行决定构筑方向",
  },
  {
    id: "infantry",
    name: "步兵防线",
    traits: ["步兵", "护卫", "陆行者"],
    reserve: 5,
    description: "稳健攒息，以步兵减甲配合物理输出，护卫保护后排",
  },
  {
    id: "assassins",
    name: "幽影猎杀",
    traits: ["刺杀", "野兽"],
    reserve: -10,
    description: "积极追星，以刺杀与狼群压制后排",
  },
  {
    id: "beasts",
    name: "荒原兽群",
    traits: ["野兽", "先锋", "猛禽"],
    reserve: 0,
    description: "野兽与猛禽协同，先锋前排支撑突袭与持续输出",
  },
  {
    id: "fleet",
    name: "空海舰队",
    traits: ["空军", "海神", "攻城"],
    reserve: 10,
    description: "积累空海羁绊，以维修强化主力，寻找方舟和电蛟输出核心",
  },
  {
    id: "pandas",
    name: "熊猫宗师",
    traits: ["熊猫", "护卫", "支援"],
    reserve: 5,
    description: "围绕初始能量、治疗和控制构筑",
  },
  {
    id: "insects",
    name: "异虫蜂群",
    traits: ["异虫", "异能", "狙击"],
    reserve: 0,
    description: "收集异虫加速升星，以魅惑和异能吸血支撑杀人蜂持续输出",
  },
  {
    id: "psychic",
    name: "灵能不朽",
    traits: ["灵能", "不朽", "召唤"],
    reserve: 5,
    description: "以不朽前排延续反伤，童子充能带动雷法与召唤",
  },
  {
    id: "armor",
    name: "装甲爆破",
    traits: ["装甲", "爆破", "攻城"],
    reserve: 0,
    description:
      "铁狗与铁猿支撑前排，爆破技能削弱密集阵容，投石车和高费装甲接续输出",
  },
  {
    id: "puppets",
    name: "傀儡卫阵",
    traits: ["傀儡", "召唤", "护卫"],
    reserve: 0,
    description:
      "收集不同傀儡形成四人核心，寻找六傀儡全队攻击与召唤协同；缺少拼图时保留过渡战力",
  },
];
export function isAiProfileId(value: unknown): value is AiProfileId {
  return (
    typeof value === "string" &&
    value !== "free" &&
    AI_PROFILES.some((p) => p.id === value)
  );
}
/** Legacy seats keep their old profiles; explicit doctrine takes precedence in new games. */
export function profileFor(
  player: Pick<Player, "id" | "aiProfile">,
): AiProfile {
  return (
    AI_PROFILES.find((p) => p.id === player.aiProfile) ??
    AI_PROFILES[player.id] ??
    AI_PROFILES[0]
  );
}
/** A separate seeded stream keeps opening shops identical for controlled comparisons. */
export function opponentProfiles(
  seed: number,
  available?: UnitDef[],
): AiProfileId[] {
  const ids = AI_PROFILES.flatMap((p) =>
    p.id === "free" ||
    (available &&
      available.filter((u) => u.traits.includes(p.traits[0])).length < 2)
      ? []
      : [p.id],
  );
  // Avalanche nearby seeds before the first draw, which determines the omitted doctrine.
  let mixed = (seed ^ 0x9e3779b9) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85ebca6b);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35);
  const state = { seed: (mixed ^ (mixed >>> 16)) >>> 0 };
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return Array.from({ length: 7 }, (_, i) => ids[i % ids.length]);
}
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
