import type { DamageType, CombatVersion } from "../engine/types";

/** Independent single-player balance; these are not recovered original skill values. */
export interface SkillDef {
  name: string;
  role: string;
  multiplier: number;
  damageType: DamageType;
  radius: number;
  duration: number;
  shieldRatio: number;
  healRatio: number;
  description: string;
}
const define = (
  skill: Partial<SkillDef> & Pick<SkillDef, "name" | "role" | "description">,
): SkillDef => ({
  multiplier: 0,
  damageType: "physical",
  radius: 0,
  duration: 0,
  shieldRatio: 0,
  healRatio: 0,
  ...skill,
});
export const SKILLS: Record<string, SkillDef> = {
  cavalry: define({
    name: "强击",
    role: "冲锋先锋",
    multiplier: 2.2,
    description:
      "初始满能量，冲向当前敌人身旁空格，造成 220% 攻击的物理伤害并眩晕 0.5 秒。无落点且不在攻击范围时保留能量；重新蓄满可再次冲锋。",
  }),
  dragonfly: define({
    name: "幻歌",
    role: "能量压制",
    multiplier: 1.3,
    damageType: "magic",
    duration: 8,
    description:
      "音波造成 130% 攻击的法术伤害，随后清空目标能量，并封锁其能量获取 2 秒；不会阻止普通攻击。",
  }),
  shadowblade: define({
    name: "暗影之舞",
    role: "高阶刺杀",
    multiplier: 2,
    radius: 1,
    shieldRatio: 0.25,
    duration: 20,
    description:
      "初始满能量，跃向最远的敌人，获得自身最大生命 25% 的护盾（5 秒），对自身周围 1 格敌人造成 200% 攻击的物理伤害。无空位则在原地攻击范围内施放。",
  }),
  turtle: define({
    name: "玄甲",
    role: "重甲防线",
    duration: 24,
    description:
      "初始满能量，自身护甲提高 12 点，持续 6 秒；同种护甲强化刷新持续时间，不叠加。",
  }),
  tiger: define({
    name: "虎羿",
    role: "箭雨清场",
    multiplier: 1.8,
    radius: 2,
    description:
      "向目标及其周围 2 格敌人发射箭雨，造成 180% 攻击的物理伤害，无视 30% 护甲。",
  }),
  bull: define({
    name: "牛魔变",
    role: "突进破阵",
    multiplier: 1.9,
    radius: 1,
    description:
      "冲向目标身边的空格，震击自身周围 1 格敌人，造成 190% 攻击的物理伤害并眩晕 1 秒。无落点且不在攻击范围时保留能量。",
  }),
  fish: define({
    name: "位面观测",
    role: "驱散辅助",
    radius: 3,
    healRatio: 0.12,
    description:
      "初始能量 50。驱散周围 3 格存活友军的眩晕、破甲和能量封锁，并恢复施法者最大生命 12% 的生命；不复活阵亡单位。",
  }),
  deer: define({
    name: "长生庇护",
    role: "后排保护",
    radius: 3,
    duration: 20,
    healRatio: 0.15,
    shieldRatio: 0.25,
    description:
      "保护周围 3 格生命比例最低的 2 名友军，各获得施法者最大生命 25% 的护盾和 6 点护甲（5 秒），并恢复施法者最大生命 15% 的生命。同种保护不叠加。",
  }),
  infantry: define({
    name: "精准射击",
    role: "破甲输出",
    multiplier: 2,
    description:
      "先使目标护甲降低 4 点，持续 4 秒，再造成 200% 攻击的物理伤害。同种破甲刷新持续时间，不叠加。",
  }),
  guard: define({
    name: "震荡重击",
    role: "护盾控制",
    multiplier: 1.4,
    shieldRatio: 0.3,
    duration: 20,
    description:
      "获得自身最大生命 30% 的护盾，持续 5 秒；盾击造成 140% 攻击的物理伤害，并眩晕目标 1 秒。",
  }),
  pangolin: define({
    name: "破阵冲击",
    role: "范围破甲",
    multiplier: 1.6,
    radius: 1,
    description:
      "冲击目标及其周围 1 格敌人，先降低其护甲 4 点（4 秒），再造成 160% 攻击的物理伤害。",
  }),
  panda: define({
    name: "影袭",
    role: "后排刺杀",
    multiplier: 2.4,
    description:
      "闪现到生命比例最低的敌人身边，造成 240% 攻击的物理伤害；没有空位则攻击当前目标。",
  }),
  sniper: define({
    name: "穿透弹",
    role: "直线贯穿",
    multiplier: 2.4,
    description:
      "射出贯穿直至棋盘边缘的弹道，对路径上的所有敌人造成 240% 攻击的物理伤害，无视一半护甲。",
  }),
  lion: define({
    name: "怒吼",
    role: "团队加速",
    radius: 2,
    duration: 16,
    shieldRatio: 0.2,
    description:
      "获得自身最大生命 20% 的护盾，并使自身及周围 2 格友军攻击间隔缩短 30%，持续 4 秒。同种加速不叠加。",
  }),
  chariot: define({
    name: "集束轰击",
    role: "范围轰炸",
    multiplier: 1.8,
    damageType: "magic",
    radius: 1,
    description:
      "炮弹轰击目标及其周围 1 格敌人，造成 180% 攻击的法术伤害。法术不受护甲影响，当前单位基础法术减伤为 20%。",
  }),
  monk: define({
    name: "气劲",
    role: "群体治疗",
    radius: 3,
    healRatio: 0.25,
    description:
      "治疗自身周围 3 格内生命比例最低的 3 名友军，每人恢复施法者最大生命的 25%，不超过目标生命上限，不复活阵亡单位。",
  }),
  wolf: define({
    name: "幽影突袭",
    role: "突袭吸血",
    multiplier: 2,
    healRatio: 0.6,
    description:
      "闪现到生命比例最低的敌人身边，造成 200% 攻击的物理伤害，并恢复实际生命伤害的 60%；无空位则攻击当前目标。",
  }),
  cannon: define({
    name: "裁决",
    role: "破能贯穿",
    multiplier: 3,
    damageType: "magic",
    description:
      "轨道光束贯穿目标方向上的敌人，造成 300% 攻击的法术伤害，并消耗每名命中敌人 30 点能量。",
  }),
  master: define({
    name: "横扫",
    role: "横扫击退",
    multiplier: 2,
    radius: 1,
    description:
      "横扫自身周围 1 格敌人，造成 200% 攻击的物理伤害，并向外击退 1 格；边界或落点被占据时不击退。",
  }),
  titan: define({
    name: "天坠",
    role: "范围控制",
    multiplier: 2.2,
    damageType: "magic",
    radius: 2,
    description:
      "重击目标及其周围 2 格敌人，造成 220% 攻击的法术伤害，并眩晕 1.5 秒。",
  }),
};
export function skillDescription(
  id: string,
  version: CombatVersion = "signature",
): string {
  if (version === "signature") {
    if (id === "cavalry")
      return "开场首次行动时冲锋，每场仅一次。冲向当前敌人身旁空格，造成 220% 攻击的物理伤害并眩晕 0.5 秒。无落点且不在攻击范围时保留机会；不消耗或积累能量。";
    if (id === "turtle")
      return "开场首次行动时获得 12 点额外护甲，按星级在 8/12/16 秒内逐渐减至零，每场仅一次；与其他来源的护甲增益分别计算，不受技能强度加成，不消耗或积累能量。";
    if (id === "tiger")
      return "第 1、5、9…次攻击改为箭雨：攻击目标周围 2 格，造成 180% 攻击的物理伤害，无视 30% 护甲。攻速能加快箭雨循环，不消耗或积累能量；金色条表示攻击循环。";
    if (id === "fish")
      return "被动：相邻 1 格有存活的非灵鱼友军时隐蔽，不被普通攻击或追击选中，仍受范围伤害。敌方灵鱼在 3 格内可看破。初始能量 50；满能量驱散周围 3 格友军的眩晕、破甲和能量封锁，并为这些友军各回复施法者最大生命 12% 的生命。";
  }
  return `能量满 100 时自动施放。${SKILLS[id].description}`;
}
