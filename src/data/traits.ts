import type { Trait } from "../engine/types";
export interface TraitBonus {
  hp?: number;
  armor?: number;
  interval?: number;
  mana?: number;
  shield?: number;
  attack?: number;
  regen?: number;
  skillPower?: number;
  shred?: number;
  jump?: boolean;
  supportHeal?: number;
  supportMana?: number;
}
export interface TraitTier {
  count: number;
  description: string;
  bonus: TraitBonus;
}
export const TACTICS_TRAIT_TIERS: Record<Trait, TraitTier[]> = {
  骑兵: [
    { count: 2, description: "骑兵普攻破甲 3 点 / 3 秒", bonus: { shred: 3 } },
  ],
  支援: [
    {
      count: 2,
      description: "支援阵亡时，全体存活友军恢复 200 生命和 10 能量",
      bonus: { supportHeal: 200, supportMana: 10 },
    },
    {
      count: 3,
      description: "支援阵亡时，全体存活友军恢复 350 生命和 20 能量",
      bonus: { supportHeal: 350, supportMana: 20 },
    },
  ],
  步兵: [
    { count: 2, description: "步兵生命 +200", bonus: { hp: 200 } },
    { count: 3, description: "步兵生命 +400", bonus: { hp: 400 } },
  ],
  装甲: [
    { count: 2, description: "装甲护甲 +3", bonus: { armor: 3 } },
    { count: 3, description: "装甲护甲 +6", bonus: { armor: 6 } },
  ],
  野兽: [
    {
      count: 2,
      description: "野兽攻击间隔缩短 0.125 秒",
      bonus: { interval: 0.5 },
    },
    {
      count: 3,
      description: "野兽攻击间隔缩短 0.3125 秒",
      bonus: { interval: 1.25 },
    },
  ],
  熊猫: [
    { count: 2, description: "熊猫初始能量 +50", bonus: { mana: 50 } },
    {
      count: 3,
      description: "熊猫开战满能量，技能强度 +15%",
      bonus: { mana: 100, skillPower: 0.15 },
    },
  ],
  护卫: [
    { count: 2, description: "护卫获得 250 开战护盾", bonus: { shield: 250 } },
    { count: 4, description: "护卫获得 600 开战护盾", bonus: { shield: 600 } },
  ],
  狙击: [
    { count: 2, description: "狙击攻击 +15%", bonus: { attack: 0.15 } },
    {
      count: 4,
      description: "狙击攻击 +35%，普攻破甲 2 点 / 3 秒",
      bonus: { attack: 0.35, shred: 2 },
    },
  ],
  先锋: [
    {
      count: 2,
      description: "先锋生命 +100，每秒恢复 32 生命",
      bonus: { hp: 100, regen: 8 },
    },
  ],
  刺杀: [
    {
      count: 2,
      description: "刺杀攻击 +20%，开战跳向敌方后排",
      bonus: { attack: 0.2, jump: true },
    },
  ],
};

/** Rules 0.6. Keep the previous table intact for saved 0.4/0.5 battles. */
export const TRAIT_TIERS: Record<Trait, TraitTier[]> = {
  ...TACTICS_TRAIT_TIERS,
  步兵: [
    TACTICS_TRAIT_TIERS.步兵[0],
    { count: 3, description: "步兵生命 +300", bonus: { hp: 300 } },
  ],
  狙击: [
    TACTICS_TRAIT_TIERS.狙击[0],
    {
      count: 4,
      description: "狙击攻击 +25%，普攻破甲 2 点 / 3 秒",
      bonus: { attack: 0.25, shred: 2 },
    },
  ],
};
