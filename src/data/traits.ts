import type { CombatVersion, Trait } from "../engine/types";
export interface TraitBonus {
  airGroundBonus?: number;
  damageMana?: number;
  siegeDirect?: true;
  teamLifesteal?: number;
  armorPenetration?: number;
  enemyManaPenalty?: number;
  seaWard?: number;
  criticalChance?: number;
  criticalMultiplier?: number;
  teamAttack?: number;
  haste?: number;
  teamHaste?: number;
  enemyArmor?: number;
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
  /** Exactly this many different deployed names; duplicate copies still count once. */
  exclusive?: true;
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

/** 0.12–0.22 rules, retained for deterministic historical replays. */
export const METAMORPH_TRAIT_TIERS: Record<Trait, TraitTier[]> = {
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

/** S03 May 9 infantry thresholds; highest tier replaces lower tiers in this adaptation. */
export const INFANTRY_TRAIT_TIERS: Record<Trait, TraitTier[]> = {
  ...METAMORPH_TRAIT_TIERS,
  步兵: [3, 6, 9].map((enemyArmor, index) => ({
    count: (index + 1) * 2,
    description: `全体敌人护甲降低 ${enemyArmor} 点（整场生效，含后续召唤物；取最高档，护甲减伤最低为零）`,
    bonus: { enemyArmor },
  })),
};
/** S1 formation totals. Higher tiers replace lower tiers; do not add totals twice. */
export const TRAIT_TIERS: Record<Trait, TraitTier[]> = {
  ...INFANTRY_TRAIT_TIERS,
  装甲: [15, 50].map((perSecond, index) => ({
    count: (index + 1) * 2,
    description: `装甲每秒恢复 ${perSecond} 生命（取最高档；阵亡不再恢复）`,
    bonus: { regen: perSecond / 4 },
  })),
  爆破: [20, 60].map((percent, index) => ({
    count: (index + 1) * 3,
    description: `全体敌人法术减伤降低 ${percent} 个百分点（取最高档，最低 −25%；含后续召唤物）`,
    bonus: { magicBreak: percent / 100 },
  })),
};
export const PUPPET_TRAIT_TIERS: Record<Trait, TraitTier[]> = {
  ...TRAIT_TIERS,
  傀儡: [
    {
      count: 2,
      description: "傀儡攻击 +10%（取最高档，不传递给召唤物）",
      bonus: { attack: 0.1 },
    },
    {
      count: 4,
      description: "傀儡攻击 +15%（取最高档，不传递给召唤物）",
      bonus: { attack: 0.15 },
    },
    {
      count: 6,
      description:
        "全队攻击 +20%（含后续召唤物，取最高档；开战锁定，不叠加低档）",
      bonus: { teamAttack: 0.2 },
    },
  ],
};
/** S03 May 9 cells: beast speed and vanguard armor. Highest tier is a local choice. */
export const WILDFRONT_TRAIT_TIERS: Record<Trait, TraitTier[]> = {
  ...PUPPET_TRAIT_TIERS,
  野兽: [
    {
      count: 2,
      description: "野兽攻速 +15%（取最高档，不传递给召唤物）",
      bonus: { haste: 0.15 },
    },
    {
      count: 4,
      description: "全队攻速 +25%（含后续召唤物，取最高档；开战锁定）",
      bonus: { teamHaste: 0.25 },
    },
    {
      count: 6,
      description: "全队攻速 +35%（含后续召唤物，取最高档；开战锁定）",
      bonus: { teamHaste: 0.35 },
    },
  ],
  先锋: [6, 8].map((armor, index) => ({
    count: (index + 1) * 3,
    description: `先锋护甲 +${armor}（取最高档；不额外增加生命或回复）`,
    bonus: { armor },
  })),
};
export function traitTiers(version: CombatVersion) {
  return version === "coalitions" ||
    version === "aurora" ||
    version === "qi" ||
    version === "taotie"
    ? COALITION_TRAIT_TIERS
    : version === "lineages"
      ? LINEAGE_TRAIT_TIERS
      : version === "counterplay"
        ? COUNTERPLAY_TRAIT_TIERS
        : version === "formations"
          ? FORMATION_TRAIT_TIERS
          : version === "ambush"
            ? AMBUSH_TRAIT_TIERS
            : version === "wildfront"
              ? WILDFRONT_TRAIT_TIERS
              : version === "puppets"
                ? PUPPET_TRAIT_TIERS
                : version === "armored"
                  ? TRAIT_TIERS
                  : version === "infantry"
                    ? INFANTRY_TRAIT_TIERS
                    : version === "fleet" || version === "metamorph"
                      ? METAMORPH_TRAIT_TIERS
                      : version === "tactics"
                        ? TACTICS_TRAIT_TIERS
                        : AIRSEA_TRAIT_TIERS;
}

/** S03 and the contemporary first-person S50 guide: second tier totals 20%. */
export const AMBUSH_TRAIT_TIERS: Record<Trait, TraitTier[]> = {
  ...WILDFRONT_TRAIT_TIERS,
  刺杀: [0.1, 0.2].map((criticalChance, index) => ({
    count: (index + 1) * 3,
    description: `刺杀普攻有 ${Math.round(criticalChance * 100)}% 概率造成4.5倍暴击${index ? "（六档总概率）" : ""}；技能不触发。单名刺杀即可开战跳后排`,
    bonus: { criticalChance, criticalMultiplier: 4.5, jump: true },
  })),
};

/** S03/S50 cumulative steps, with own-trait and team beneficiaries kept separate. */
export const FORMATION_TRAIT_TIERS: Record<Trait, TraitTier[]> = {
  ...AMBUSH_TRAIT_TIERS,
  步兵: [3, 3 + 6, 3 + 6 + 9].map((enemyArmor, index) => ({
    count: (index + 1) * 2,
    description: `全体敌人护甲降低 ${enemyArmor} 点（累计总量；整场生效，含后续召唤物；护甲减伤最低为零）`,
    bonus: { enemyArmor },
  })),
  先锋: [6, 6 + 8].map((armor, index) => ({
    count: (index + 1) * 3,
    description: `先锋护甲 +${armor}（累计总量；不额外增加生命或回复）`,
    bonus: { armor },
  })),
  傀儡: [
    {
      count: 2,
      description: "傀儡攻击 +10%（不传递给召唤物）",
      bonus: { attack: 0.1 },
    },
    {
      count: 4,
      description: "傀儡攻击 +25%（10%+15%累计，不传递给召唤物）",
      bonus: { attack: 0.1 + 0.15 },
    },
    {
      count: 6,
      description: "傀儡攻击 +45%，其他友军及后续召唤物 +20%（累计；开战锁定）",
      bonus: { attack: 0.1 + 0.15, teamAttack: 0.2 },
    },
  ],
  野兽: [0, 0.25, 0.25 + 0.35].map((teamHaste, index) => ({
    count: (index + 1) * 2,
    description: teamHaste
      ? `野兽攻速 +${Math.round((0.15 + teamHaste) * 100)}%，其他友军及后续召唤物 +${Math.round(teamHaste * 100)}%（累计；开战锁定）`
      : "野兽攻速 +15%（不传递给召唤物）",
    bonus: { haste: 0.15, ...(teamHaste ? { teamHaste } : {}) },
  })),
};

/** S03/S18 sniper/cavalry and pre-May-28 sea/psychic totals in the contemporary third review. */
export const COUNTERPLAY_TRAIT_TIERS: Record<Trait, TraitTier[]> = {
  ...FORMATION_TRAIT_TIERS,
  狙击: [4, 12].map((armorPenetration, i) => ({
    count: (i + 1) * 3,
    description: `狙击物理伤害无视 ${armorPenetration} 点护甲（累计总量；不使目标减甲，不额外增加攻击）`,
    bonus: { armorPenetration },
  })),
  骑兵: [
    {
      count: 2,
      description:
        "敌方全军每次回能减少 3（倍率后扣除，最低为零；含后续召唤物，不影响初始能量）",
      bonus: { enemyManaPenalty: 3 },
    },
  ],
  海神: [0.2, 0.4].map((seaWard, i) => ({
    count: (i + 1) * 2,
    description: `空中友军法术减伤 +${Math.round(seaWard * 100)} 个百分点（累计总量；与装备、召唤叠加后最多75%，爆破另行削减；落地失效）`,
    bonus: { seaWard },
  })),
  灵能: [20, 50].map((reflection, i) => ({
    count: (i + 1) * 2,
    description: `全体友军受击反弹 ${reflection} 点真实伤害（累计总量，含残魂与召唤物；不减免原伤害、不再次反弹）`,
    bonus: { reflection },
  })),
};

/** S03 cumulative 5/5/10 steps; S18 explicitly reports total team lifesteal 5/10/20. */
export const LINEAGE_TRAIT_TIERS: Record<Trait, TraitTier[]> = {
  ...COUNTERPLAY_TRAIT_TIERS,
  异能: [0.05, 0.1, 0.2].map((teamLifesteal, i) => ({
    count: (i + 1) * 2,
    description: `全体友军普攻吸血 ${Math.round(teamLifesteal * 100)}%（累计总量；按实际生命伤害回复，含后续召唤物，与装备相加；技能、反伤不触发）`,
    bonus: { teamLifesteal },
  })),
};

/** S03/S50 early coalition rules. Raw increments remain separate in research records. */
export const COALITION_TRAIT_TIERS: Record<Trait, TraitTier[]> = {
  ...LINEAGE_TRAIT_TIERS,
  爆破: [0.2, 0.5].map((magicBreak, i) => ({
    count: (i + 1) * 3,
    description: `全体敌人法术减伤降低 ${Math.round(magicBreak * 100)} 个百分点（累计总量，最低−25%；含后续召唤物）`,
    bonus: { magicBreak },
  })),
  空军: [0.15, 0.35].map((evasion, i) => ({
    count: (i + 1) * 2,
    description: `全部空中友军普攻闪避 ${Math.round(evasion * 100)}%（累计总量；落地失效，技能不闪避）`,
    bonus: { evasion },
  })),
  猛禽: [0.15, 0.35].map((airGroundBonus, i) => ({
    count: (i + 1) * 2,
    description: `全部空中友军对地普攻伤害 +${Math.round(airGroundBonus * 100)}%（累计总量；落地失效，技能不增加）`,
    bonus: { airGroundBonus },
  })),
  支援: [
    {
      count: 2,
      description:
        "支援阵亡时，全体存活友军恢复200生命和10能量（含召唤物；不能复活）",
      bonus: { supportHeal: 200, supportMana: 10 },
    },
    {
      count: 4,
      description:
        "支援阵亡时，全体存活友军恢复500生命和20能量（累计总量，含召唤物；不能复活）",
      bonus: { supportHeal: 500, supportMana: 20 },
    },
  ],
  召唤: [
    {
      count: 3,
      description:
        "全体友军普攻造成生命伤害时的回能 +40%（每次攻击最多一次；不增加受击、支援或充能回能，不附赠法术减伤）",
      bonus: { damageMana: 0.4 },
    },
  ],
  攻城: [0.25, 0.5].map((siege, i) => ({
    count: (i + 1) * 3,
    description: `全军对装甲、空军、傀儡、海神、异虫、不朽的直接伤害 +${Math.round(siege * 100)}%（累计总量，含普攻与直接技能；不增加反伤和持续伤害）`,
    bonus: { siege, siegeDirect: true },
  })),
  陆行者: [
    {
      count: 1,
      exclusive: true,
      description:
        "上阵仅1种陆行者时，该种棋子的普攻为真实伤害；同名可重复，多种陆行者同时上阵则失效",
      bonus: { trueAttack: true },
    },
  ],
  熊猫: [
    {
      count: 3,
      description: "3种熊猫开战满能量（不额外增加技能强度）",
      bonus: { mana: 100 },
    },
  ],
};
