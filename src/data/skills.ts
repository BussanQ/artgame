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
export const HAWK_METAMORPH = define({
  name: "血羽化身",
  role: "落地连击",
  description:
    "满能量时变为地面形态并恢复至满生命，每场一次，不位移或立即造成技能伤害。此后每次普攻变为三段爪击，每段造成 60% 攻击物伤，后两段相隔 0.25 秒；每段独立计算护盾、闪避、吸血和反伤。控制或阵亡取消余下连击，目标死亡、隐蔽、脱离射程或成为友方也会取消。形态持续到本场结束，不再积累能量；落地后失去飞行闪避与海神回能，仍保留本族对地增伤。回血不受技能强度加成，不复活。",
});
export const SKILLS: Record<string, SkillDef> = {
  motorcycle: define({
    name: "三连发",
    role: "逐发转火爆发",
    damageType: "magic",
    description:
      "初始能量50。满能量且技能冷却结束时架枪，0.5秒后开火，每隔0.5秒一发，共三发。每发重新选择3格内最近的可见敌人，造成100/200/400法伤（一/二/三星），受施法时技能强度加成；目标阵亡后可转火。10秒冷却从开始施法计算，期间可普攻、移动和回能。连发期间不能移动或普攻；眩晕、沉默、魅惑、阵亡或射程内无可见敌人会取消余弹，不返还能量或重置冷却。",
  }),
  flametrooper: define({
    name: "火龙爆射",
    role: "前排喷焰灼烧",
    multiplier: 2,
    damageType: "magic",
    radius: 3,
    description:
      "初始能量25。沿当前目标方向向前喷火，覆盖最远3格、逐渐展开的锥形区域（正向首排1格，后两排各3格；斜向按实际朝向判定）。命中敌人受到200%攻击法伤，并附着灼烧，1秒后开始每秒造成35%攻击法伤，共3次。灼烧倍率在施法时锁定，同一火焰兵重施刷新，不同火焰兵可叠加；施法者阵亡后仍持续。涅槃化为火种会移除灼烧。",
  }),
  grenadier: define({
    name: "高爆榴弹",
    role: "范围沉默",
    multiplier: 2,
    damageType: "magic",
    radius: 1,
    description:
      "初始能量50。向当前目标所在格投掷榴弹，命中该格及周围九宫格敌人，造成200%攻击法伤，并沉默2/3/4秒（一/二/三星）。沉默打断正在进行的主动引导或蓄力，并阻止新的能量技能；不清空能量，不阻止移动、普攻、回能或开场被动。重施只刷新至较晚结束时间，不叠加时长；灵鱼可驱散。",
  }),
  medic: define({
    name: "生命守护",
    role: "持续范围治疗",
    radius: 2,
    description:
      "初始能量 50。满能量且周围 2 格内有受伤友军时，以自身当前格为固定中心引导治疗。1 秒后开始，每秒一次，共 4 次；每次为区域内每名友军恢复 75/100/125 生命（一/二/三星），受施法时技能强度加成。包括自身，不复活阵亡单位，也不治疗不朽残魂或涅槃火种；无受伤友军时保留能量。引导期间不能移动或普攻，眩晕、魅惑或阵亡会中断，走出区域的友军不再受治疗。",
  }),
  whale: define({
    name: "虚空潮汐",
    role: "范围真伤削坦",
    damageType: "true",
    radius: 2,
    description:
      "初始能量 35。锁定当前敌人所在格及周围 2 格，1 秒后开始，每秒一次，共 10 次潮汐。每次按命中目标最大生命的 3%/4%/5%（一/二/三星）造成真实伤害，受技能强度加成，无视护甲和法术减伤，仍受护盾和不朽免伤影响。区域不追踪目标，逐次按当前站位命中；引导期间不能移动或普攻，眩晕、魅惑或阵亡立即中断。",
  }),
  phoenix: define({
    name: "燎原 / 涅槃",
    role: "持续火焰与重生",
    multiplier: 0.9,
    damageType: "magic",
    radius: 2,
    description:
      "初始能量 25。满能量后固定朝向前方 5 格长、3 格宽区域喷火，每秒一次，共 4 次，每次 90% 攻击法伤；引导时不能移动或普攻，眩晕、魅惑或阵亡会中断。二星起首次致死化为地面火种，生命 800/1600，占据原格且可被攻击；不能行动、治疗、加盾或回能。3 秒内未被打破则恢复本体满生命、零能量，每战仅一次；一星没有重生。火种保留原护甲和装备防御，不计为治疗。",
  }),
  bat: define({
    name: "震魂声波",
    role: "持续控制",
    damageType: "magic",
    duration: 4,
    description:
      "向当前目标施加震魂声波，眩晕 1 秒；0.25 秒后首次、随后每秒造成 40% 攻击法伤，共 5 次。声波在施法者阵亡后仍持续；同一蝙蝠再次施放刷新声波，不叠加。",
  }),
  bloodhawk: define({
    name: "血羽突袭",
    role: "突袭续战",
    damageType: "physical",
    multiplier: 2,
    description:
      "跃向生命比例最低的敌人，造成 200% 攻击物理伤害，按实际生命伤害回复自身 50%。无合法落点且当前敌人不在攻击范围时保留能量。",
  }),
  skytoad: define({
    name: "吞云噬体",
    role: "单次吞噬",
    damageType: "true",
    description:
      "初始能量 25。满能量时吞噬 2 格内当前生命低于自身的敌人，优先其中生命最高者，造成足以清空其当前护盾和生命的真实伤害，每场成功施放一次。不能选择不朽残魂；致命吞噬仍会触发不朽续战或死亡效果。没有合适目标则保留能量。",
  }),
  vajra: define({
    name: "镇岳重击",
    role: "减速防线",
    damageType: "magic",
    multiplier: 1.2,
    radius: 1,
    description:
      "初始能量 25。自身获得最大生命 20% 护盾，持续 4 秒；震击周围 1 格敌人，造成 120% 攻击法伤，使其攻击间隔增加 40%，持续 4 秒。同类减速刷新、不叠加。",
  }),
  arhat: define({
    name: "破妄真言",
    role: "蓄力真伤",
    damageType: "true",
    multiplier: 3,
    description:
      "满能量锁定当前目标，蓄力 1 秒后造成 300% 攻击真实伤害；期间不能移动或普攻，攻击冷却正常流逝。眩晕、魅惑、阵亡会打断；目标阵亡或转为友方时落空，不返还能量。",
  }),
  winddragon: define({
    name: "游龙卷风",
    role: "范围控制",
    damageType: "magic",
    multiplier: 1.4,
    radius: 1,
    duration: 6,
    description:
      "初始能量 50。龙卷命中当前目标及其周围 1 格敌人，造成 140% 攻击法伤并眩晕 1.5 秒；可打断蓄力和引导。",
  }),
  acolyte: define({
    name: "灵珠充能",
    role: "能量辅助",
    description:
      "初始能量 50。满能量时为 3 格内攻击最高的 2 名能量未满友军补充 25/35/45 能量，受能量封锁和异能压制影响。不选择童子、召唤物或非能量技能棋子；无合适目标则保留能量。",
  }),
  stormcaller: define({
    name: "雷电法球",
    role: "范围输出",
    multiplier: 1.8,
    damageType: "magic",
    radius: 2,
    description:
      "向当前目标投掷雷电球，对其周围 2 格敌人造成 180% 攻击法术伤害。",
  }),
  thunderlord: define({
    name: "九霄连雷",
    role: "连锁爆发",
    multiplier: 2.4,
    damageType: "magic",
    description:
      "初始能量 50。向当前目标释放连锁闪电，最多命中 4 个不同敌人，每次跳向上一目标 3 格内最近的敌人。首次为 240% 攻击法伤，后续每跳衰减 20%；不重复命中，隐蔽敌人仍可被连锁波及。",
  }),
  vine: define({
    name: "枯藤缠身",
    role: "单体控制",
    multiplier: 1.6,
    damageType: "magic",
    duration: 6,
    description:
      "藤鞭缠住当前目标，造成 160% 攻击法术伤害并眩晕 1.5 秒；控制会打断蓄力与引导。",
  }),
  bonedragon: define({
    name: "冥霜吐息",
    role: "范围控制",
    multiplier: 2.2,
    damageType: "magic",
    radius: 1,
    duration: 4,
    description:
      "向当前目标喷出冥霜，对目标及其周围 1 格敌人造成 220% 攻击法术伤害并眩晕 1 秒。",
  }),
  treant: define({
    name: "古木震荡",
    role: "前排群控",
    multiplier: 1.5,
    damageType: "magic",
    radius: 2,
    duration: 8,
    description:
      "树根震荡自身周围 2 格，对敌人造成 150% 攻击法术伤害并眩晕 2 秒，自身获得最大生命 20% 的护盾，持续 4 秒；不朽残魂期间不能获得护盾。",
  }),
  repair: define({
    name: "战地维修",
    role: "主力强化",
    description:
      "初始能量 50。满能量时修复 4 格内攻击最高的存活友军（可选自身），恢复施法者最大生命 25% 的生命；目标攻击提升 25/35/45%，持续 4 秒。治疗受技能强度加成，同种强化不叠加，取较强值并刷新持续时间。",
  }),
  ghostjet: define({
    name: "幽影迁跃",
    role: "隐身突袭",
    multiplier: 2,
    description:
      "满能量时跃向生命比例最低的敌人身旁，造成 200% 攻击物理伤害，并进入 2 秒相位隐身；期间无法被普攻选中，仍会受到范围技能伤害。无空位时在原攻击范围内施放，否则保留能量。",
  }),
  bomber: define({
    name: "轰炸巡航",
    role: "持续轰炸",
    multiplier: 0.9,
    damageType: "magic",
    radius: 2,
    description:
      "满能量时获得 8 点护甲，持续 3 秒，并开始定点轰炸：0.25 秒后首次、随后每秒一次，共 3 次，对自身 2 格内敌人各造成 90% 攻击法伤。引导期间不移动或普攻；眩晕、魅惑及阵亡中止剩余轰炸，不返还能量。",
  }),
  ark: define({
    name: "虚空重炮",
    role: "蓄力贯穿",
    multiplier: 3.2,
    damageType: "magic",
    description:
      "满能量时锁定当前目标方向，蓄力 1 秒后发射贯穿直至棋盘边缘的光束，造成 320% 攻击法伤。蓄力期间不能移动或普攻，光束不会追踪走位；眩晕、魅惑及阵亡中断施法，不返还能量。",
  }),
  skycrab: define({
    name: "聚能狙杀",
    role: "单体爆发",
    multiplier: 4.5,
    damageType: "magic",
    description:
      "满能量时锁定自身 3 格内攻击最高的敌人，造成 450% 攻击法术伤害。按实际扣血计算伤害，不穿透护盾。",
  }),
  eel: define({
    name: "雷霆领域",
    role: "定点多段",
    multiplier: 0.9,
    damageType: "magic",
    radius: 2,
    description:
      "满能量时锁定目标所在区域并引导雷场：0.25 秒后首次、随后每秒一次，共 3 次，每次对区域 2 格内最多 4 名敌人造成 90% 攻击法伤。敌人离开区域可躲避，后进入者可被命中；引导中不移动或普攻，眩晕、魅惑及阵亡取消后续脉冲。",
  }),
  eyebug: define({
    name: "凝视",
    role: "单体控制",
    multiplier: 1.3,
    damageType: "magic",
    description: "凝视当前目标，造成 130% 攻击的法术伤害并眩晕 1.5 秒。",
  }),
  blastbug: define({
    name: "殉爆",
    role: "阵亡爆破",
    radius: 2,
    damageType: "magic",
    description:
      "被动：阵亡时爆炸，对自身周围 2 格敌人造成自身最大生命 35% 的法术伤害，受技能强度加成。每场一次，不积累能量；可引爆敌方爆裂虫形成连锁。",
  }),
  spider: define({
    name: "魅惑",
    role: "临时策反",
    description:
      "初始能量 50。满能量时魅惑 3 格内攻击最高、未被魅惑的非召唤敌人，使其临时转向攻击原队友，并获得 20% 攻击加成。一/二/三星持续 2/3/4 秒，每场一次。目标期间不能施法或获取能量，到期恢复阵营及攻击；召唤物免疫。仅魅惑最后敌人不会直接判胜，施法者阵亡不解除控制。",
  }),
  wasp: define({
    name: "蜂群震荡",
    role: "近身群攻",
    multiplier: 2.2,
    radius: 2,
    damageType: "magic",
    description:
      "向自身周围 2 格释放震荡，造成 220% 攻击的法术伤害。范围内无敌人时保留能量，普通攻击射程 3 格。",
  }),
  adept: define({
    name: "灵木化生",
    role: "持续召唤",
    description:
      "初始能量 50。满能量在相邻空格召唤 1 只灵木傀儡，施法间隔至少 8 秒，每名真人最多同时维持 2 只；无空位或达到上限时保留能量。一/二/三星傀儡生命 380/760/1520，攻击 48/96/192，护甲 3，攻击间隔 0.75 秒。生命和攻击受技能强度加成；不继承装备或傀儡攻击羁绊，享受团队召唤法术减伤。",
  }),
  shark: define({
    name: "镇海卫阵",
    role: "盾卫召唤",
    description:
      "满能量在相邻空格召唤最多 2 名镇海盾卫，每场一次；无空位保留能量。落点相邻敌人眩晕 0.5 秒。一/二/三星盾卫生命 800/1600/3200，攻击 45/90/180，护甲 8，攻击间隔 1 秒。生命和攻击受技能强度加成；不继承装备或傀儡攻击羁绊，享受团队召唤法术减伤。",
  }),
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
  version: CombatVersion = "metamorph",
): string {
  if (id === "bloodhawk" && version === "metamorph")
    return HAWK_METAMORPH.description;
  if (version === "metamorph") version = "fleet";
  if (id === "bomber" && version === "fleet")
    return `初始能量 50。${SKILLS.bomber.description}引导期间攻击冷却正常流逝。`;
  if (["ark", "eel"].includes(id) && version === "fleet")
    return `${SKILLS[id].description}蓄力或引导期间攻击冷却正常流逝。`;
  if (id === "cannon" && (version === "airsea" || version === "fleet"))
    return "优先追击可见空中敌人，普攻对其伤害 +50% 且必中（不绕过隐身）。满能量施放裁决：光束贯穿敌人，造成 300% 攻击法伤并消耗目标 30 能量。";
  if (id === "blastbug" || id === "motorcycle") return SKILLS[id].description;
  if (id === "adept" || id === "shark")
    return `${SKILLS[id].description}召唤物下一战斗步开始行动，不能施法，主人阵亡后仍作战；不占人口或卡池，每只存活召唤物在胜利扣血时计 1 点。`;
  if (
    (version === "summons" ||
      version === "legions" ||
      version === "brood" ||
      version === "airsea" ||
      version === "fleet") &&
    id === "wolf"
  )
    return "满能量时在相邻空格召唤最多 2 只幽影幼狼，每场仅一次；无空位则保留能量。一/二/三星幼狼生命 400/800/1600，攻击 40/80/160，护甲 2，攻击间隔 0.75 秒；生命和攻击受召唤者技能强度加成，不继承装备或召唤者个人开场增益。幼狼下一战斗步开始行动，可接受友军技能，召唤者阵亡后仍作战，每只存活幼狼在胜利扣血时计 1 点。召唤物不占人口、卡池或备战席，不能施法、购买或出售。";
  if (
    version === "signature" ||
    version === "summons" ||
    version === "legions" ||
    version === "brood" ||
    version === "airsea" ||
    version === "fleet"
  ) {
    if (id === "cavalry")
      return "开场首次行动时冲锋，每场仅一次。冲向当前敌人身旁空格，造成 220% 攻击的物理伤害并眩晕 0.5 秒。无落点且不在攻击范围时保留机会；不消耗或积累能量。";
    if (id === "turtle")
      return "开场首次行动时获得 12 点额外护甲，按星级在 8/12/16 秒内逐渐减至零，每场仅一次；与其他来源的护甲增益分别计算，不受技能强度加成，不消耗或积累能量。";
    if (id === "tiger")
      return "第 1、5、9…次攻击改为箭雨：攻击目标周围 2 格，造成 180% 攻击的物理伤害，无视 30% 护甲。攻速能加快箭雨循环，不消耗或积累能量；金色条表示攻击循环。";
    if (id === "fish")
      return "被动：相邻 1 格有存活的非灵鱼友军时隐蔽，不被普通攻击或追击选中，仍受范围伤害。敌方灵鱼在 3 格内可看破。初始能量 50；满能量驱散周围 3 格友军的眩晕、破甲、能量封锁和沉默，并为这些友军各回复施法者最大生命 12% 的生命。";
  }
  return `能量满 100 时自动施放。${SKILLS[id].description}`;
}

export const skillName = (id: string, version: CombatVersion = "metamorph") =>
  id === "bloodhawk" && version === "metamorph"
    ? HAWK_METAMORPH.name
    : (version === "summons" ||
          version === "legions" ||
          version === "brood" ||
          version === "airsea" ||
          version === "fleet" ||
          version === "metamorph") &&
        id === "wolf"
      ? "幽狼召唤"
      : SKILLS[id].name;
export const skillRole = (id: string, version: CombatVersion = "metamorph") =>
  id === "bloodhawk" && version === "metamorph"
    ? HAWK_METAMORPH.role
    : (version === "summons" ||
          version === "legions" ||
          version === "brood" ||
          version === "airsea" ||
          version === "fleet" ||
          version === "metamorph") &&
        id === "wolf"
      ? "狼群召唤"
      : SKILLS[id].role;
