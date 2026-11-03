import type { Trait } from "../engine/types";
export interface TraitBonus {
  groundBonus?: number;
  trueAttack?: boolean;
  reflection?: number;
  immortal?: number;
  evasion?: number;
  seaMana?: number;
  siege?: number;
  magicBreak?: number;
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
  summonWard?: number;
}
export interface TraitTier {
  count: number;
  description: string;
  bonus: TraitBonus;
}
export const TACTICS_TRAIT_TIERS: Record<Trait, TraitTier[]> = {
  猛禽: [
    {
      count: 2,
      description: "猛禽普攻对地面目标伤害 +15%",
      bonus: { groundBonus: 0.15 },
    },
    {
      count: 3,
      description: "猛禽普攻对地面目标伤害 +35%",
      bonus: { groundBonus: 0.35 },
    },
  ],
  陆行者: [
    {
      count: 1,
      description: "陆行者普攻造成真实伤害，仍受护盾、闪避和不朽免伤影响",
      bonus: { trueAttack: true },
    },
  ],
  灵能: [
    {
      count: 2,
      description:
        "全体友军受击反弹 20 点真实伤害，残魂和召唤物也生效，反伤不再次反弹",
      bonus: { reflection: 20 },
    },
    {
      count: 4,
      description:
        "全体友军受击反弹 30 点真实伤害，残魂和召唤物也生效，反伤不再次反弹",
      bonus: { reflection: 30 },
    },
  ],
  不朽: [
    {
      count: 2,
      description:
        "不朽首次阵亡化为残魂继续战斗 4 秒，不能治疗，不增加战后扣血",
      bonus: { immortal: 16 },
    },
    {
      count: 3,
      description:
        "不朽首次阵亡化为残魂继续战斗 6 秒，不能治疗，不增加战后扣血",
      bonus: { immortal: 24 },
    },
  ],
  空军: [
    {
      count: 2,
      description: "所有空中友军获得 15% 普攻闪避",
      bonus: { evasion: 0.15 },
    },
    {
      count: 4,
      description: "所有空中友军获得 30% 普攻闪避",
      bonus: { evasion: 0.3 },
    },
  ],
  海神: [
    {
      count: 2,
      description: "空中友军造成生命伤害额外回能 10，每战斗步一次",
      bonus: { seaMana: 10 },
    },
    {
      count: 4,
      description: "空中友军造成生命伤害额外回能 20，每战斗步一次",
      bonus: { seaMana: 20 },
    },
  ],
  攻城: [
    {
      count: 3,
      description: "全队普攻对装甲、空军、傀儡、海神、异虫伤害 +15%",
      bonus: { siege: 0.15 },
    },
    {
      count: 6,
      description: "全队普攻对装甲、空军、傀儡、海神、异虫伤害 +30%",
      bonus: { siege: 0.3 },
    },
  ],
  爆破: [
    {
      count: 3,
      description: "全体敌人法术减伤降低 10 个百分点",
      bonus: { magicBreak: 0.1 },
    },
  ],
  异虫: [
    {
      count: 2,
      description:
        "持有2种不同异虫（含备战席），两枚同名一星异虫合成二星；二星升三星仍需三枚",
      bonus: {},
    },
    {
      count: 4,
      description:
        "持有4种不同异虫（含备战席），两枚同名同星异虫即可升星，最高三星",
      bonus: {},
    },
  ],
  异能: [{ count: 2, description: "全体敌方的能量获取降低 25%", bonus: {} }],
  召唤: [
    {
      count: 2,
      description: "全体友军及召唤物法术减伤 +15 个百分点",
      bonus: { summonWard: 0.15 },
    },
    {
      count: 3,
      description: "全体友军及召唤物法术减伤 +25 个百分点",
      bonus: { summonWard: 0.25 },
    },
  ],
  傀儡: [
    {
      count: 2,
      description: "傀儡攻击 +15%（不传递给召唤物）",
      bonus: { attack: 0.15 },
    },
  ],
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
export const AIRSEA_TRAIT_TIERS: Record<Trait, TraitTier[]> = {
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

/** Current 0.12 rules; retain the 0.11 table for deterministic historical replays. */
export const TRAIT_TIERS: Record<Trait, TraitTier[]> = {
  ...AIRSEA_TRAIT_TIERS,
  // Only reachable with 0.20 additions; existing 0.19 armies have at most four infantry.
  步兵: [
    ...AIRSEA_TRAIT_TIERS.步兵,
    { count: 6, description: "步兵生命 +600", bonus: { hp: 600 } },
  ],
  空军: [
    AIRSEA_TRAIT_TIERS.空军[0],
    {
      count: 4,
      description: "所有空中友军获得 45% 普攻闪避",
      bonus: { evasion: 0.45 },
    },
  ],
};
