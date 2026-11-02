import type { Game, Piece } from "../engine/types";
export interface Encounter {
  round: number;
  name: string;
  hint: string;
  units: [string, number, number, number][];
}
/** Single-player encounter schedule and balance, not recovered historical PvE values. */
export const TACTICS_ENCOUNTERS: Encounter[] = [
  {
    round: 1,
    name: "荒原斥候",
    hint: "两只弱小甲兽。招募 2–3 名棋子，前排保护远程。",
    units: [
      ["pangolin", 1, 35, 0.35],
      ["pangolin", 1, 37, 0.35],
    ],
  },
  {
    round: 2,
    name: "幽影狼群",
    hint: "鬼狼会突袭残血目标，避免让单个远程孤立。",
    units: [
      ["wolf", 1, 34, 0.5],
      ["wolf", 1, 37, 0.5],
    ],
  },
  {
    round: 3,
    name: "狮王营地",
    hint: "先集中火力，再处理狮王的护盾和加速。",
    units: [
      ["lion", 1, 35, 0.75],
      ["pangolin", 1, 34, 0.5],
      ["pangolin", 1, 37, 0.5],
    ],
  },
  {
    round: 10,
    name: "遗迹守军",
    hint: "装甲前排掩护炮车，突袭与法术输出更有效。",
    units: [
      ["guard", 2, 35, 1],
      ["guard", 2, 36, 1],
      ["chariot", 2, 59, 0.85],
    ],
  },
  {
    round: 15,
    name: "狂兽围猎",
    hint: "分散站位防止前排被包围，治疗能延长承伤。",
    units: [
      ["lion", 2, 35, 1.2],
      ["wolf", 2, 34, 1],
      ["wolf", 2, 37, 1],
      ["pangolin", 2, 43, 1],
    ],
  },
  {
    round: 20,
    name: "铁壁防线",
    hint: "法术与破甲克制重装，注意贯穿光束。",
    units: [
      ["titan", 2, 35, 1.1],
      ["guard", 2, 34, 1.2],
      ["guard", 2, 37, 1.2],
      ["cannon", 2, 59, 1],
    ],
  },
  {
    round: 25,
    name: "灵能暴潮",
    hint: "治疗与范围控制配合，快速切入后排压制恢复。",
    units: [
      ["monk", 3, 43, 1],
      ["master", 2, 35, 1.2],
      ["panda", 3, 37, 1],
      ["cannon", 2, 60, 1.2],
    ],
  },
  {
    round: 30,
    name: "终焉巨神",
    hint: "最终试炼。分散站位躲开重击，使用成装武装主力。",
    units: [
      ["titan", 3, 35, 1.2],
      ["titan", 2, 37, 1.2],
      ["cannon", 3, 58, 1],
      ["chariot", 3, 61, 1],
    ],
  },
];
/** 0.6 keeps two elite threats, with a two-star support catapult. */
export const ENCOUNTERS: Encounter[] = TACTICS_ENCOUNTERS.map((e) =>
  e.round !== 30
    ? e
    : {
        ...e,
        hint: "最终试炼。分散防止范围重击，注意两翼炮火；最终排名按战后生命计算。",
        units: [
          ["titan", 3, 35, 1],
          ["titan", 2, 37, 1],
          ["cannon", 3, 58, 1],
          ["chariot", 2, 61, 1],
        ],
      },
);
export function encounterFor(
  g: Pick<Game, "round" | "encountersFromRound"> &
    Partial<Pick<Game, "combatVersion">>,
): Encounter | null {
  return g.round >= g.encountersFromRound
    ? ((g.combatVersion === "tactics" || g.combatVersion === "legacy"
        ? TACTICS_ENCOUNTERS
        : ENCOUNTERS
      ).find((e) => e.round === g.round) ?? null)
    : null;
}
export function encounterArmy(e: Encounter): Piece[] {
  return e.units.map(([defId, star, position, encounterPower], i) => ({
    uid: 900000000 + e.round * 100 + i,
    defId,
    star,
    position,
    encounterPower,
    items: [],
  }));
}
