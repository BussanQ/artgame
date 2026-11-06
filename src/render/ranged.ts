import { REST_POSE, type AttackPose } from "./melee";
import {
  CURRENT_COMBAT_VERSION,
  hasTerminatorRules,
  hasShurikenRules,
  hasSecretOrbRules,
  hasAuroraRules,
  hasQiRules,
  hasGospelRules,
  hasStormRules,
  type CombatVersion,
} from "../engine/types";
export const RANGED_ACTIONS = {
  titan: { name: "架炮装填与主炮后坐", duration: 4.2, fireAt: 0.28, impactAt: 0.68, color: "#ffc080" },
  monk: {
    name:"转杖凝珠推出",duration:4.8,fireAt:0.38,impactAt:0.75,color:"#97ead6",
  },
  panda: {
    name: "拧腰扬臂掷镖", duration: 3.8, fireAt: 0.34, impactAt: 0.73, color: "#b8edec",
  },
  lingjiu: {
    name: "展鳍俯身鸣击",
    duration: 4.8,
    fireAt: 0.32,
    impactAt: 0.7,
    color: "#d6b2f5",
  },
  ironrooster: {
    name: "双足稳架交替炮击",
    duration: 3.8,
    fireAt: 0.24,
    impactAt: 0.72,
    color: "#efcb85",
  },
  birdrider: {
    name: "跨鞍张弓振羽",
    duration: 3.2,
    fireAt: 0.3,
    impactAt: 0.7,
    color: "#dceea0",
  },
  specialist: {
    name: "半跪锁定拉栓重狙",
    duration: 4.6,
    fireAt: 0.46,
    impactAt: 0.58,
    color: "#a6e8ef",
  },
  motorcycle: {
    name: "压车架炮后坐",
    duration: 2,
    fireAt: 0.18,
    impactAt: 0.55,
    color: "#ffc173",
  },
  flametrooper: {
    name: "压肩横扫喷焰",
    duration: 3.8,
    fireAt: 0.18,
    impactAt: 0.62,
    color: "#ffb365",
  },
  grenadier: {
    name: "后仰扬臂抛弹",
    duration: 4.2,
    fireAt: 0.42,
    impactAt: 0.8,
    color: "#c9a2ff",
  },
  medic: {
    name: "泵压注射枪点射",
    duration: 3.4,
    fireAt: 0.36,
    impactAt: 0.68,
    color: "#94ffe2",
  },
  whale: {
    name: "摆尾俯首吐潮环",
    duration: 4.2,
    fireAt: 0.4,
    impactAt: 0.78,
    color: "#8fe5e1",
  },
  phoenix: {
    name: "扬翼甩出焰羽",
    duration: 3.8,
    fireAt: 0.35,
    impactAt: 0.72,
    color: "#ffc880",
  },
  bat: {
    name: "振耳吐声锥",
    duration: 3.8,
    fireAt: 0.3,
    impactAt: 0.7,
    color: "#c6a8ff",
  },
  skytoad: {
    name: "鼓喉弹舌",
    duration: 3.8,
    fireAt: 0.38,
    impactAt: 0.6,
    color: "#c5ec99",
  },
  arhat: {
    name: "合掌推出法印",
    duration: 3.8,
    fireAt: 0.4,
    impactAt: 0.72,
    color: "#ffe1a3",
  },
  winddragon: {
    name: "盘颈吐风刃",
    duration: 3.8,
    fireAt: 0.28,
    impactAt: 0.65,
    color: "#a3f2df",
  },
  acolyte: {
    name: "托珠推掌",
    duration: 3.8,
    fireAt: 0.35,
    impactAt: 0.7,
    color: "#a1fff0",
  },
  stormcaller: {
    name: "拂袖掷雷球",
    duration: 3.8,
    fireAt: 0.3,
    impactAt: 0.75,
    color: "#c3a5ff",
  },
  thunderlord: {
    name: "振翼击雷锤",
    duration: 3.8,
    fireAt: 0.4,
    impactAt: 0.55,
    color: "#b8e8ff",
  },
  bonedragon: {
    name: "振翼吐冥焰",
    duration: 3.8,
    fireAt: 0.32,
    impactAt: 0.65,
    color: "#aaf7dc",
  },
  repair: {
    name: "悬停甩臂电弧",
    duration: 3.8,
    fireAt: 0.3,
    impactAt: 0.65,
    color: "#94ffe2",
  },
  bomber: {
    name: "侧倾投弹",
    duration: 3.8,
    fireAt: 0.24,
    impactAt: 0.73,
    color: "#ffd093",
  },
  ghostjet: {
    name: "偏航双翼齐射",
    duration: 2.8,
    fireAt: 0.2,
    impactAt: 0.58,
    color: "#b5c3ff",
  },
  ark: {
    name: "双舷蓄能射击",
    duration: 3.8,
    fireAt: 0.42,
    impactAt: 0.6,
    color: "#8aeeff",
  },
  skycrab: {
    name: "翼脊聚能弹",
    duration: 3.8,
    fireAt: 0.35,
    impactAt: 0.7,
    color: "#c5f4b7",
  },
  eel: {
    name: "盘身甩尾电击",
    duration: 3.8,
    fireAt: 0.28,
    impactAt: 0.5,
    color: "#9fc6ff",
  },
  eyebug: {
    name: "凝瞳脉冲",
    duration: 3.8,
    fireAt: 0.38,
    impactAt: 0.6,
    color: "#b1ff93",
  },
  spider: {
    name: "伏身吐丝",
    duration: 3.8,
    fireAt: 0.3,
    impactAt: 0.7,
    color: "#d8a6ff",
  },
  wasp: {
    name: "振翅甩针",
    duration: 2.8,
    fireAt: 0.25,
    impactAt: 0.65,
    color: "#ffe288",
  },
  adept: {
    name: "引杖飞符",
    duration: 3.8,
    fireAt: 0.33,
    impactAt: 0.72,
    color: "#a4f1ce",
  },
  dragonfly: {
    name: "振翅鸣波",
    duration: 2.8,
    fireAt: 0.24,
    impactAt: 0.65,
    color: "#9deaff",
  },
  tiger: {
    name: "压身张弓",
    duration: 2.8,
    fireAt: 0.32,
    impactAt: 0.72,
    color: "#ffe1a1",
  },
  fish: {
    name: "摆尾灵珠",
    duration: 3.6,
    fireAt: 0.2,
    impactAt: 0.68,
    color: "#a0ffe0",
  },
  deer: {
    name: "昂首引光",
    duration: 3.6,
    fireAt: 0.38,
    impactAt: 0.72,
    color: "#d7ffac",
  },
  infantry: {
    name: "步枪三连点射",
    duration: 2.8,
    fireAt: 0.15,
    impactAt: 0.48,
    color: "#ffd787",
  },
  sniper: {
    name: "定点蓄力狙击",
    duration: 3.8,
    fireAt: 0.4,
    impactAt: 0.54,
    color: "#b4edff",
  },
  chariot: {
    name: "仰炮抛射轰击",
    duration: 4.6,
    fireAt: 0.22,
    impactAt: 0.7,
    color: "#ffb66b",
  },
  cannon: {
    name: "聚能轨道炮",
    duration: 3.8,
    fireAt: 0.43,
    impactAt: 0.48,
    color: "#75edff",
  },
} as const;
export type RangedId = keyof typeof RANGED_ACTIONS;
export function isRanged(id: string, version: CombatVersion = CURRENT_COMBAT_VERSION): id is RangedId {
  return Object.hasOwn(RANGED_ACTIONS, id) && (id !== "panda" || hasShurikenRules(version)) &&
    (id !== "monk" || hasSecretOrbRules(version)) && (id !== "titan" || hasTerminatorRules(version));
}
const pulse = (t: number, a: number, b: number) =>
  t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a));
export function rangedActionName(
  id: RangedId,
  version: CombatVersion = CURRENT_COMBAT_VERSION,
) {
  if (id === "stormcaller" && hasStormRules(version)) return "晶核聚能推波";
  if (id === "acolyte" && hasGospelRules(version)) return "悬壳晶核脉冲";
  if (id === "skycrab" && !hasAuroraRules(version)) return "合钳聚能弹";
  if (id === "arhat" && hasQiRules(version)) return "晶核掌击";
  return RANGED_ACTIONS[id].name;
}
export function rangedPose(
  id: RangedId,
  t: number,
  skill = false,
  qi = false,
  gospel = false,
  thunderstorm = false,
): AttackPose {
  if (t <= 0 || t >= 1) return { ...REST_POSE };
  const p = { ...REST_POSE };
  if (id === "stormcaller" && thunderstorm) {
    const gather=pulse(t,0,0.45),release=pulse(t,0.4,0.85);
    p.lift=7*gather;p.forward=-12*gather+20*release;
    p.rotation=-0.06*gather+0.04*release;
    p.scaleX=1-0.07*gather+0.08*release;p.scaleY=1+0.06*gather;
    return p;
  }
  if (id === "acolyte" && gospel) {
    const gather = pulse(t, 0, 0.35), release = pulse(t, 0.3, 0.82);
    p.lift = 5 * gather + 2 * release;
    p.forward = -5 * gather + 12 * release;
    p.rotation = -0.04 * gather + 0.07 * release;
    p.scaleX = 1 + 0.04 * gather - 0.04 * release;
    p.scaleY = 1 - 0.03 * gather + 0.06 * release;
    return p;
  }
  if (id === "arhat" && qi) {
    const draw = pulse(t, 0, 0.4),
      release = pulse(t, 0.38, 0.88);
    p.rotation = -0.06 * draw + 0.05 * release;
    p.scaleX = 1 - 0.05 * draw + 0.08 * release;
    p.scaleY = 1 - 0.04 * draw;
    p.forward = -8 * draw + (skill ? 30 : 20) * release;
    p.lift = 3 * draw;
    return p;
  }
  switch (id) {
    case "titan": {
      const brace = pulse(t, 0, 0.34), recoil = pulse(t, 0.25, 0.7);
      p.forward = -4 * brace - 18 * recoil; p.lift = -3 * brace + 2 * recoil;
      p.rotation = -0.035 * brace + 0.07 * recoil; p.scaleY = 1 - 0.045 * brace;
      p.scaleX = 1 + 0.025 * recoil;
      break;
    }
    case "monk": {
      const gather=pulse(t,0,0.42),push=pulse(t,0.34,0.86);
      p.rotation=-0.055*gather+0.045*push;p.forward=-7*gather+(skill?19:13)*push;
      p.scaleX=1-0.045*gather+0.045*push;p.scaleY=1+0.025*gather;
      p.lift=2.5*gather;p.trail=0.15*push;
      break;
    }
    case "panda": {
      const windup = pulse(t,0,0.38), release = pulse(t,0.3,0.82);
      p.rotation = -0.17 * windup + 0.13 * release;
      p.forward = -13 * windup + (skill ? 23 : 16) * release;
      p.lift = 4 * windup + 2 * release;
      p.scaleX = 1 - 0.08 * windup + 0.06 * release;
      p.scaleY = 1 - 0.025 * release;
      p.trail = 0.3 * release;
      break;
    }
    case "lingjiu": {
      const draw = pulse(t, 0, 0.35),
        release = pulse(t, 0.25, 0.76),
        settle = pulse(t, 0.7, 1);
      p.lift = 11 * draw + (skill ? 10 : 4) * release;
      p.forward = -10 * draw + 8 * release;
      p.rotation = -0.16 * draw + 0.11 * release - 0.05 * settle;
      p.scaleX = 1 - 0.12 * draw + 0.09 * release;
      p.scaleY = 1 + 0.11 * draw - 0.06 * release;
      p.trail = 0.45 * release;
      break;
    }
    case "ironrooster":
      p.forward = -16 * pulse(t, 0.18, 0.55) - 11 * pulse(t, 0.43, 0.86);
      p.rotation = -0.12 * pulse(t, 0.18, 0.55) + 0.1 * pulse(t, 0.43, 0.86);
      p.scaleY = 1 - 0.08 * pulse(t, 0.1, 0.9);
      p.lift = 5 * pulse(t, 0, 0.3);
      break;
    case "birdrider":
      p.lift = 7 * pulse(t, 0, 0.45) - 3 * pulse(t, 0.45, 0.9);
      p.forward = -13 * pulse(t, 0, 0.3) + 14 * pulse(t, 0.3, 0.75);
      p.rotation = -0.1 * pulse(t, 0, 0.3) + 0.09 * pulse(t, 0.3, 0.9);
      p.scaleX = 1 + 0.08 * pulse(t, 0.1, 0.6);
      p.scaleY = 1 - 0.055 * pulse(t, 0.3, 0.8);
      break;
    case "specialist": {
      const brace = pulse(t, 0, 0.46),
        recoil = pulse(t, 0.46, 0.7),
        bolt = pulse(t, 0.7, 1);
      p.scaleY = 1 - 0.14 * brace;
      p.forward = 6 * brace - 25 * recoil - 5 * bolt;
      p.rotation = 0.025 * brace - 0.15 * recoil + 0.06 * bolt;
      p.scaleX = 1 + 0.04 * bolt;
      break;
    }
    case "motorcycle":
      p.forward = 7 * pulse(t, 0, 0.2) - 22 * pulse(t, 0.2, 0.8);
      p.rotation = -0.12 * pulse(t, 0.18, 0.8);
      p.scaleY = 1 - 0.1 * pulse(t, 0.15, 0.75);
      p.lift = 4 * pulse(t, 0.25, 0.8);
      break;
    case "flametrooper":
      p.forward = 15 * pulse(t, 0, 0.8);
      p.rotation = 0.1 * pulse(t, 0.08, 0.8) * Math.sin(t * Math.PI * 3);
      p.scaleY = 1 - 0.08 * pulse(t, 0, 0.7);
      p.scaleX = 1 + 0.09 * pulse(t, 0.08, 0.85);
      break;
    case "grenadier":
      p.forward = -18 * pulse(t, 0, 0.42) + 25 * pulse(t, 0.42, 0.85);
      p.rotation = -0.22 * pulse(t, 0, 0.42) + 0.28 * pulse(t, 0.42, 0.9);
      p.lift = 12 * pulse(t, 0.2, 0.65);
      p.scaleX = 1 - 0.1 * pulse(t, 0, 0.4);
      break;
    case "medic":
      p.forward = 9 * pulse(t, 0, 0.36) - 15 * pulse(t, 0.36, 0.76);
      p.rotation = -0.07 * pulse(t, 0, 0.36) + 0.11 * pulse(t, 0.36, 0.76);
      p.scaleY = 1 - 0.055 * pulse(t, 0.36, 0.8);
      p.lift = 3 * pulse(t, 0.15, 0.5);
      break;
    case "whale":
      p.rotation = -0.13 * pulse(t, 0, 0.4) + 0.18 * pulse(t, 0.4, 0.9);
      p.lift = 13 * pulse(t, 0, 0.55);
      p.scaleY = 1 + 0.12 * pulse(t, 0, 0.4) - 0.09 * pulse(t, 0.4, 0.85);
      p.forward = -10 * pulse(t, 0, 0.4) + 21 * pulse(t, 0.4, 0.85);
      break;
    case "phoenix":
      p.lift = 22 * pulse(t, 0, 0.6);
      p.scaleX = 1 + 0.22 * pulse(t, 0, 0.35) - 0.12 * pulse(t, 0.35, 0.8);
      p.rotation = 0.16 * pulse(t, 0.35, 0.9);
      p.forward = 17 * pulse(t, 0.35, 0.8);
      break;
    case "bat":
      p.scaleX = 1 + 0.2 * pulse(t, 0, 0.32);
      p.lift = 11 * pulse(t, 0, 1);
      p.scaleY = 1 - 0.1 * pulse(t, 0.3, 0.8);
      p.forward = -12 * pulse(t, 0.3, 0.8);
      break;
    case "skytoad":
      p.scaleX = 1 + 0.16 * pulse(t, 0, 0.4);
      p.scaleY = 1 + 0.18 * pulse(t, 0, 0.4) - 0.14 * pulse(t, 0.38, 0.8);
      p.forward = 26 * pulse(t, 0.38, 0.8);
      break;
    case "arhat":
      p.rotation = -0.09 * pulse(t, 0, 0.4);
      p.scaleX = 1 - 0.13 * pulse(t, 0, 0.4);
      p.forward = -8 * pulse(t, 0, 0.4) + 22 * pulse(t, 0.4, 0.85);
      p.lift = 5 * pulse(t, 0.4, 0.85);
      break;
    case "winddragon":
      p.rotation = -0.2 * pulse(t, 0, 0.3) + 0.24 * pulse(t, 0.28, 0.75);
      p.scaleX = 1 - 0.12 * pulse(t, 0, 0.3) + 0.15 * pulse(t, 0.28, 0.75);
      p.forward = 18 * pulse(t, 0.28, 0.75);
      p.lift = 7 * pulse(t, 0, 0.5);
      break;
    case "acolyte":
      p.lift = 8 * pulse(t, 0, 0.7);
      p.forward = -7 * pulse(t, 0, 0.35) + 18 * pulse(t, 0.35, 0.85);
      p.scaleX = 1 - 0.06 * pulse(t, 0, 0.35);
      break;
    case "stormcaller":
      p.rotation = -0.2 * pulse(t, 0, 0.3) + 0.18 * pulse(t, 0.3, 0.85);
      p.forward = 12 * pulse(t, 0.3, 0.85);
      p.scaleY = 1 + 0.07 * pulse(t, 0, 0.3);
      break;
    case "thunderlord":
      p.lift = 20 * pulse(t, 0, 0.45);
      p.scaleX = 1 + 0.16 * pulse(t, 0, 0.4);
      p.forward = 15 * pulse(t, 0.4, 0.8);
      p.rotation = 0.1 * pulse(t, 0.4, 0.85);
      break;
    case "bonedragon":
      p.lift = 14 * pulse(t, 0, 0.6);
      p.scaleX = 1 + 0.15 * pulse(t, 0, 0.38);
      p.rotation = -0.12 * pulse(t, 0, 0.3) + 0.14 * pulse(t, 0.3, 0.85);
      p.forward = 20 * pulse(t, 0.3, 0.8);
      break;
    case "repair":
      p.rotation = 0.18 * Math.sin(t * Math.PI * 2);
      p.lift = 9 * pulse(t, 0, 1);
      p.forward = -10 * pulse(t, 0.3, 0.7);
      break;
    case "bomber":
      p.rotation = -0.22 * pulse(t, 0, 0.35) + 0.15 * pulse(t, 0.3, 0.9);
      p.lift = 14 * pulse(t, 0, 0.5);
      p.scaleY = 1 - 0.08 * pulse(t, 0.24, 0.7);
      break;
    case "ghostjet":
      p.forward = 24 * pulse(t, 0, 0.5) - 17 * pulse(t, 0.45, 1);
      p.rotation = -0.16 * pulse(t, 0.1, 0.65);
      p.scaleX = 1 - 0.1 * pulse(t, 0.1, 0.65);
      break;
    case "ark":
      p.lift = 5 * pulse(t, 0, 0.5);
      p.forward = -24 * pulse(t, 0.42, 0.9);
      p.scaleY = 1 + 0.04 * pulse(t, 0, 0.42);
      break;
    case "skycrab":
      p.scaleX = 1 - 0.18 * pulse(t, 0, 0.38) + 0.1 * pulse(t, 0.35, 0.8);
      p.lift = 11 * pulse(t, 0, 1);
      p.forward = -16 * pulse(t, 0.35, 0.85);
      break;
    case "eel":
      p.rotation = -0.3 * pulse(t, 0, 0.3) + 0.27 * pulse(t, 0.25, 0.8);
      p.scaleY = 1 - 0.12 * pulse(t, 0, 0.4);
      p.forward = 20 * pulse(t, 0.28, 0.75);
      break;
    case "eyebug":
      p.lift = 12 * pulse(t, 0, 1);
      p.scaleX = 1 + 0.18 * pulse(t, 0, 0.38);
      p.forward = -14 * pulse(t, 0.38, 0.8);
      break;
    case "spider":
      p.scaleY = 1 - 0.22 * pulse(t, 0, 0.4);
      p.scaleX = 1 + 0.1 * pulse(t, 0, 0.4);
      p.forward = 16 * pulse(t, 0.2, 0.7);
      p.rotation = 0.07 * pulse(t, 0.3, 0.9);
      break;
    case "wasp":
      p.lift = 18 * pulse(t, 0, 1);
      p.rotation = -0.28 * pulse(t, 0, 0.3) + 0.3 * pulse(t, 0.25, 0.75);
      p.scaleX = 1 + 0.07 * Math.sin(t * Math.PI * 12) * pulse(t, 0, 1);
      p.forward = 18 * pulse(t, 0.25, 0.8);
      break;
    case "adept":
      p.lift = 8 * pulse(t, 0, 0.55);
      p.rotation = -0.13 * pulse(t, 0, 0.35) + 0.16 * pulse(t, 0.3, 0.8);
      p.forward = 11 * pulse(t, 0.3, 0.8);
      p.scaleX = 1 - 0.06 * pulse(t, 0, 0.35);
      break;
    case "dragonfly": {
      const flutter = pulse(t, 0, 1);
      p.scaleX = 1 + Math.sin(t * Math.PI * 8) * 0.11 * flutter;
      p.lift = 15 * flutter;
      p.forward = -9 * pulse(t, 0.24, 0.7);
      p.rotation = 0.09 * Math.sin(t * Math.PI * 2);
      break;
    }
    case "tiger":
      p.scaleY = 1 - 0.14 * pulse(t, 0, 0.4);
      p.forward = -13 * pulse(t, 0.32, 0.78);
      p.lift = 8 * pulse(t, 0.3, 0.7);
      p.rotation = -0.08 * pulse(t, 0.32, 0.78);
      break;
    case "fish":
      p.rotation = 0.25 * Math.sin(t * Math.PI * 2);
      p.scaleX = 1 + 0.12 * pulse(t, 0.1, 0.65);
      p.lift = 10 * pulse(t, 0, 1);
      p.forward = 7 * pulse(t, 0.15, 0.6);
      break;
    case "deer":
      p.rotation = -0.16 * pulse(t, 0, 0.42) + 0.06 * pulse(t, 0.38, 0.82);
      p.lift = 13 * pulse(t, 0, 0.55);
      p.forward = -5 * pulse(t, 0.38, 0.8);
      p.scaleY = 1 + 0.06 * pulse(t, 0, 0.55);
      break;
    case "infantry": {
      const recoil =
        pulse(t, 0.15, 0.3) + pulse(t, 0.34, 0.49) + pulse(t, 0.53, 0.68);
      p.forward = -8 * recoil;
      p.rotation = -0.07 * recoil;
      p.lift = 1.5 * recoil;
      break;
    }
    case "sniper": {
      const aim = pulse(t, 0, 0.42),
        recoil = pulse(t, 0.4, 0.72);
      p.forward = 3 * aim - 16 * recoil;
      p.scaleY = 1 - 0.08 * aim;
      p.rotation = 0.035 * aim - 0.12 * recoil;
      break;
    }
    case "chariot": {
      const load = pulse(t, 0, 0.27),
        recoil = pulse(t, 0.22, 0.62);
      p.rotation = -0.19 * load + 0.16 * recoil;
      p.forward = -22 * recoil;
      p.lift = 5 * recoil;
      p.scaleY = 1 - 0.12 * recoil;
      break;
    }
    case "cannon": {
      const charge = pulse(t, 0, 0.48),
        recoil = pulse(t, 0.43, 0.82);
      p.forward = -3 * charge - 29 * recoil;
      p.scaleX = 1 + 0.035 * charge;
      p.scaleY = 1 - 0.1 * charge - 0.07 * recoil;
      p.rotation = -0.04 * recoil;
      p.lift = -3 * charge;
      break;
    }
  }
  if (skill) {
    p.forward *= 1.25;
    p.lift *= 1.2;
  }
  return p;
}
export interface Point {
  x: number;
  y: number;
}
export function projectilePoint(
  from: Point,
  to: Point,
  t: number,
  arc = 0,
): Point {
  const u = Math.max(0, Math.min(1, t));
  return {
    x: from.x + (to.x - from.x) * u,
    y: from.y + (to.y - from.y) * u - Math.sin(u * Math.PI) * arc,
  };
}
/** All visual bursts belong to ONE actual attack event; no extra damage is applied. */
export function drawRangedAttack(
  c: CanvasRenderingContext2D,
  id: RangedId,
  t: number,
  from: Point,
  to: Point,
  skill: boolean,
  qi = false,
  wildfireColor?: string,
) {
  if (t < 0 || t >= 1) return;
  const profile = RANGED_ACTIONS[id],
    power = skill ? 1.45 : 1,
    dx = to.x - from.x,
    dy = to.y - from.y,
    angle = Math.atan2(dy, dx);
  c.save();
  const color = id === "phoenix" && wildfireColor ? wildfireColor : id === "arhat" && qi ? "#93efff" : profile.color;
  c.strokeStyle = color;
  c.fillStyle = color;
  c.shadowColor = color;
  c.shadowBlur = skill ? 18 : 10;
  c.lineCap = "round";
  const line = (a: Point, b: Point, width: number, alpha = 1) => {
    c.save();
    c.globalAlpha = alpha;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
    c.restore();
  };
  const ring = (p: Point, r: number, alpha: number) => {
    c.save();
    c.globalAlpha = alpha;
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(p.x, p.y, r, r * 0.45, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  };
  const flash = (intensity: number) => {
    if (intensity <= 0) return;
    c.save();
    c.translate(from.x, from.y);
    c.rotate(angle);
    c.globalAlpha = intensity;
    c.fillStyle = "#fff4c5";
    c.beginPath();
    c.moveTo(-4, -5);
    c.lineTo(22 * power, 0);
    c.lineTo(-4, 5);
    c.lineTo(3, 0);
    c.closePath();
    c.fill();
    c.restore();
  };
  const sparks = (progress: number, count: number = 7) => {
    if (progress < 0 || progress > 1) return;
    c.save();
    c.globalAlpha = 1 - progress;
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count,
        reach = (10 + progress * 35) * power;
      c.fillRect(
        to.x + Math.cos(a) * reach,
        to.y + Math.sin(a) * reach * 0.6,
        3,
        3,
      );
    }
    c.restore();
  };
  switch (id) {
    case "titan": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      flash(pulse(t, profile.fireAt, profile.fireAt + 0.14));
      if (u >= 0 && u <= 1) {
        const at = projectilePoint(from, to, u, 30), tail = projectilePoint(from, to, Math.max(0, u - 0.13), 30);
        line(tail, at, 4, 0.8); c.save(); c.translate(at.x, at.y); c.rotate(angle);
        c.fillStyle = "#e0d8b4"; c.fillRect(-7, -3, 12, 6);
        c.fillStyle = "#ffe7a7"; c.beginPath(); c.moveTo(10, 0); c.lineTo(3, -4); c.lineTo(3, 4); c.closePath(); c.fill();
        c.restore();
      }
      sparks((t - profile.impactAt) / 0.28, 8);
      break;
    }
    case "monk": {
      const u=(t-profile.fireAt)/(profile.impactAt-profile.fireAt);
      if(u>=0&&u<=1){const p=projectilePoint(from,to,u,8);
        c.save();c.fillStyle="#bfffe9";c.shadowColor=profile.color;c.shadowBlur=12;
        c.beginPath();c.arc(p.x,p.y,6,0,Math.PI*2);c.fill();c.lineWidth=1.2;
        c.beginPath();c.ellipse(p.x,p.y,10,5,t*6,0,Math.PI*2);c.stroke();c.restore();}
      sparks((t-profile.impactAt)/0.25,5);break;
    }
    case "panda": {
      const u = (t-profile.fireAt)/(profile.impactAt-profile.fireAt);
      if (u >= 0 && u <= 1) {
        const p = projectilePoint(from,to,u,16);
        c.save(); c.translate(p.x,p.y); c.rotate(t*22);
        c.fillStyle="#def7f2"; c.strokeStyle=profile.color; c.lineWidth=1.5;
        c.beginPath();
        for(let i=0;i<8;i++) {
          const a=i*Math.PI/4,r=i%2?3:11;
          if(i)c.lineTo(Math.cos(a)*r,Math.sin(a)*r);else c.moveTo(Math.cos(a)*r,Math.sin(a)*r);
        }
        c.closePath();c.fill();c.stroke();c.restore();
      }
      sparks((t-profile.impactAt)/0.27,4);
      break;
    }
    case "lingjiu": {
      if (skill) {
        for (let i = 0; i < 3; i++) {
          const u = (t - i * 0.13) / 0.7;
          if (u > 0 && u < 1) ring(from, 10 + u * 70, (1 - u) * 0.8);
        }
      } else {
        const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
        if (u >= 0 && u <= 1) {
          const point = projectilePoint(from, to, u, 10);
          c.save();
          c.translate(point.x, point.y);
          c.rotate(angle);
          c.lineWidth = 2.5;
          for (let i = 0; i < 3; i++) {
            c.globalAlpha = 1 - i * 0.25;
            c.beginPath();
            c.arc(-i * 7, 0, 6 + i * 3, -0.9, 0.9);
            c.stroke();
          }
          c.restore();
        }
        sparks((t - profile.impactAt) / 0.3, 4);
      }
      break;
    }
    case "ironrooster": {
      for (const [index, offset] of [-8, 8].entries()) {
        const u = (t - profile.fireAt - index * 0.12) / 0.36;
        if (u < 0 || u > 1) continue;
        const muzzle = {
          x: from.x - Math.sin(angle) * offset,
          y: from.y + Math.cos(angle) * offset,
        };
        line(
          projectilePoint(muzzle, to, Math.max(0, u - 0.16)),
          projectilePoint(muzzle, to, u),
          3,
        );
        ring(muzzle, 4 + u * 5, 1 - u);
      }
      sparks((t - profile.impactAt) / 0.28, 5);
      break;
    }
    case "birdrider": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        const tip = projectilePoint(from, to, u, skill ? 9 : 24);
        const tail = projectilePoint(
          from,
          to,
          Math.max(0, u - 0.2),
          skill ? 9 : 24,
        );
        line(tail, tip, skill ? 5 : 2.5);
        c.save();
        c.translate(tip.x, tip.y);
        c.rotate(Math.atan2(tip.y - tail.y, tip.x - tail.x));
        c.beginPath();
        c.moveTo(9 * power, 0);
        c.lineTo(-4, -5 * power);
        c.lineTo(-1, 0);
        c.lineTo(-4, 5 * power);
        c.closePath();
        c.fill();
        c.restore();
        if (skill) ring(tip, 8, 0.7);
      }
      if (u > 1) {
        sparks((t - profile.impactAt) / 0.3, skill ? 10 : 3);
      }
      break;
    }
    case "specialist": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        line(
          projectilePoint(from, to, Math.max(0, u - 0.35)),
          projectilePoint(from, to, u),
          3 * power,
        );
        flash(1 - u);
      }
      if (u > 1) {
        const fade = Math.max(0, (1 - t) / (1 - profile.impactAt));
        c.globalAlpha *= fade;
        line(
          { x: to.x - 12 * power, y: to.y },
          { x: to.x + 12 * power, y: to.y },
          2,
        );
        line(
          { x: to.x, y: to.y - 12 * power },
          { x: to.x, y: to.y + 12 * power },
          2,
        );
        ring(to, (8 + (1 - fade) * 20) * power, fade);
      }
      break;
    }
    case "motorcycle": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        const at = projectilePoint(from, to, u, skill ? 18 : 0);
        line(
          projectilePoint(from, to, Math.max(0, u - 0.25), skill ? 18 : 0),
          at,
          4 * power,
        );
        c.save();
        c.translate(at.x, at.y);
        c.rotate(angle);
        c.fillStyle = "#fff1ce";
        c.fillRect(-7 * power, -3 * power, 14 * power, 6 * power);
        c.restore();
        flash(1 - u);
      }
      if (u > 1) {
        sparks((t - profile.impactAt) / (1 - profile.impactAt), 9);
        ring(to, (10 + (u - 1) * 26) * power, Math.max(0, 2 - u));
      }
      break;
    }
    case "flametrooper": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1.4) {
        const end = projectilePoint(from, to, Math.min(1, u * 2));
        for (let i = 0; i < 7; i++) {
          const q = (i + 1) / 7;
          const at = projectilePoint(from, end, q);
          const r = (3 + q * 10) * Math.max(0, Math.min(1, (1.4 - u) * 3));
          c.globalAlpha = 0.75;
          c.fillStyle = i % 2 ? "#ffe29a" : profile.color;
          c.beginPath();
          c.ellipse(
            at.x + Math.sin(i * 2 + t * 20) * 3,
            at.y,
            r,
            r * 0.7,
            angle,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
      }
      break;
    }
    case "grenadier": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        const at = projectilePoint(from, to, u, 95);
        c.save();
        c.translate(at.x, at.y);
        c.rotate(u * 8);
        c.fillRect(-5, -7, 10, 14);
        c.fillStyle = "#efe3ff";
        c.fillRect(-3, -4, 6, 3);
        c.restore();
      }
      if (u > 1) {
        ring(to, 12 + (u - 1) * 55, Math.max(0, 2 - u));
        ring(to, 5 + (u - 1) * 32, Math.max(0, 2 - u));
      }
      break;
    }
    case "medic": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        const at = projectilePoint(from, to, u);
        c.save();
        c.translate(at.x, at.y);
        c.rotate(angle);
        c.fillRect(-9, -3, 18, 6);
        c.fillStyle = "#eafff5";
        c.fillRect(4, -2, 9, 4);
        c.restore();
        ring(from, 8 + u * 10, 1 - u);
      }
      if (u > 1) ring(to, 6 + (u - 1) * 18, Math.max(0, 2 - u));
      break;
    }
    case "whale": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        const at = projectilePoint(from, to, u, 12);
        c.save();
        c.translate(at.x, at.y);
        c.rotate(angle);
        for (let i = 0; i < 3; i++) {
          c.globalAlpha = 1 - i * 0.22;
          c.beginPath();
          c.ellipse(-i * 10, 0, 4 + u * 5, 9 + u * 9, 0, 0, Math.PI * 2);
          c.stroke();
        }
        c.restore();
      }
      if (u > 1) ring(to, 15 + (u - 1) * 35, Math.max(0, 2 - u));
      break;
    }
    case "phoenix": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        const at = projectilePoint(from, to, u, 24);
        c.save();
        c.translate(at.x, at.y);
        c.rotate(angle);
        c.beginPath();
        c.moveTo(15, 0);
        c.quadraticCurveTo(-3, -10, -19, 0);
        c.quadraticCurveTo(-3, 10, 15, 0);
        c.fill();
        c.strokeStyle = "#fff1c8";
        c.beginPath();
        c.moveTo(-14, 0);
        c.lineTo(12, 0);
        c.stroke();
        c.restore();
      }
      sparks((t - profile.impactAt) / 0.28, 10);
      break;
    }
    case "bat": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        const at = projectilePoint(from, to, u);
        c.save();
        c.translate(at.x, at.y);
        c.rotate(angle);
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.arc(-i * 9, 0, 9 + u * 15 + i * 4, -0.8, 0.8);
          c.stroke();
        }
        c.restore();
      }
      if (u > 1) ring(to, 12 + (u - 1) * 25, Math.max(0, 2 - u));
      break;
    }
    case "skytoad": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1.8) {
        const tip = projectilePoint(
          from,
          to,
          u <= 1 ? u : Math.max(0, 1 - (u - 1) / 0.8),
          8,
        );
        c.save();
        c.strokeStyle = "#e9acb0";
        line(from, tip, 5 * power);
        c.beginPath();
        c.arc(tip.x, tip.y, 6 * power, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      break;
    }
    case "arhat": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (qi) {
        if (t < profile.fireAt) ring(from, 6 + (16 * t) / profile.fireAt, 0.8);
        if (u >= 0 && u <= 1) {
          const at = projectilePoint(from, to, u);
          ring(at, (skill ? 14 : 8) * power, 0.9);
          line(projectilePoint(from, to, Math.max(0, u - 0.22)), at, 5 * power);
        }
        sparks((t - profile.impactAt) / 0.28, 10);
        break;
      }
      if (t < profile.fireAt)
        ring(from, 25 * (1 - t / profile.fireAt) + 5, 0.8);
      if (u >= 0 && u <= 1) {
        const at = projectilePoint(from, to, u);
        c.save();
        c.translate(at.x, at.y);
        c.rotate(u * Math.PI * 2);
        c.strokeRect(-9, -9, 18, 18);
        c.rotate(Math.PI / 4);
        c.strokeRect(-9, -9, 18, 18);
        c.restore();
        line(projectilePoint(from, to, Math.max(0, u - 0.18)), at, 2, 0.6);
      }
      sparks((t - profile.impactAt) / 0.28, 8);
      break;
    }
    case "winddragon": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        const at = projectilePoint(from, to, u, 20);
        c.save();
        c.translate(at.x, at.y);
        c.rotate(angle + u * 5);
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.arc(0, 0, 7 + i * 5, i * 2.1, i * 2.1 + 1.5);
          c.stroke();
        }
        c.restore();
      }
      sparks((t - profile.impactAt) / 0.35, 6);
      break;
    }
    case "acolyte":
    case "stormcaller": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        const at = projectilePoint(from, to, u, id === "stormcaller" ? 55 : 14);
        c.beginPath();
        c.arc(
          at.x,
          at.y,
          (id === "stormcaller" ? 8 : 5) * power,
          0,
          Math.PI * 2,
        );
        c.fill();
        ring(at, (id === "stormcaller" ? 15 : 10) * power, 0.75);
      }
      sparks((t - profile.impactAt) / 0.25, id === "stormcaller" ? 12 : 5);
      break;
    }
    case "thunderlord": {
      if (t >= profile.fireAt && t <= profile.impactAt + 0.12) {
        let prev = from;
        for (let j = 1; j <= 9; j++) {
          const at = projectilePoint(from, to, j / 9);
          if (j < 9) at.y += Math.sin(j * 2.1) * 14 * power;
          line(prev, at, 3 * power);
          prev = at;
        }
      }
      sparks((t - profile.impactAt) / 0.3, 10);
      break;
    }
    case "bonedragon": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        for (let j = 0; j < 5; j++) {
          const part = Math.max(0, u - j * 0.055);
          const at = projectilePoint(from, to, part, 10);
          c.globalAlpha = (1 - j / 6) * 0.8;
          c.beginPath();
          c.ellipse(
            at.x,
            at.y,
            (9 - j) * power,
            (5 - j * 0.5) * power,
            angle,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
        c.globalAlpha = 1;
      }
      sparks((t - profile.impactAt) / 0.35, 9);
      break;
    }
    case "repair":
    case "eel": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        let prev = from;
        for (let j = 1; j <= 8; j++) {
          const at = projectilePoint(from, to, (u * j) / 8);
          if (j < 8)
            at.y += Math.sin(j * 2.4 + t * 24) * (id === "eel" ? 13 : 5);
          line(prev, at, id === "eel" ? 3 : 1.8);
          prev = at;
        }
        if (id === "repair") ring(from, 8, 0.8);
      }
      sparks((t - profile.impactAt) / 0.35, id === "eel" ? 9 : 4);
      break;
    }
    case "bomber": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        const at = projectilePoint(from, to, u, 40);
        c.save();
        c.translate(at.x, at.y);
        c.rotate(angle + u * 2);
        c.fillRect(-5, -8, 10, 16);
        c.restore();
        line(projectilePoint(from, to, Math.max(0, u - 0.12), 40), at, 3, 0.45);
      }
      if (u > 1)
        ring(
          to,
          12 + (t - profile.impactAt) * 95,
          Math.max(0, 1 - (t - profile.impactAt) / 0.27),
        );
      sparks((t - profile.impactAt) / 0.27, 10);
      break;
    }
    case "ghostjet": {
      for (const side of [-1, 1]) {
        const start = {
          x: from.x - Math.sin(angle) * side * 13,
          y: from.y + Math.cos(angle) * side * 13,
        };
        const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
        if (u >= 0 && u <= 1)
          line(
            projectilePoint(start, to, Math.max(0, u - 0.18)),
            projectilePoint(start, to, u),
            3,
          );
      }
      flash(pulse(t, profile.fireAt, profile.fireAt + 0.15));
      sparks((t - profile.impactAt) / 0.3, 6);
      break;
    }
    case "ark": {
      for (const side of [-1, 1]) {
        const start = {
          x: from.x - Math.sin(angle) * side * 11,
          y: from.y + Math.cos(angle) * side * 11,
        };
        if (t < profile.fireAt) ring(start, 4 + t * 20, t / profile.fireAt);
        const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
        if (u >= 0 && u <= 1)
          line(start, projectilePoint(start, to, u), 4, 1 - u * 0.3);
      }
      sparks((t - profile.impactAt) / 0.4, 12);
      break;
    }
    case "skycrab": {
      if (t < profile.fireAt) {
        const r = 22 * (1 - t / profile.fireAt) + 4;
        ring(from, r, 0.8);
        ring(from, r * 0.6, 0.6);
      }
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        const at = projectilePoint(from, to, u);
        c.beginPath();
        c.arc(at.x, at.y, 7 * power, 0, Math.PI * 2);
        c.fill();
        ring(at, 13, 0.65);
      }
      sparks((t - profile.impactAt) / 0.3, 8);
      break;
    }
    case "eyebug": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (t < profile.fireAt) ring(from, 5 + t * 35, t / profile.fireAt);
      if (u >= 0 && u <= 1) {
        line(from, projectilePoint(from, to, u), 4 * power, 1 - u * 0.6);
        ring(projectilePoint(from, to, u), 10, 0.8);
      }
      sparks((t - profile.impactAt) / 0.4, 8);
      break;
    }
    case "spider": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        const end = projectilePoint(from, to, u, 18);
        for (const offset of [-4, 0, 4])
          line(
            { x: from.x, y: from.y + offset },
            { x: end.x, y: end.y + offset },
            1.5,
          );
      }
      if (u > 1) {
        const fade = 1 - (t - profile.impactAt) / 0.3;
        for (let i = 0; i < 3; i++) ring(to, 8 + i * 8, fade);
      }
      break;
    }
    case "wasp": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        const p = projectilePoint(from, to, u);
        c.save();
        c.translate(p.x, p.y);
        c.rotate(angle);
        c.beginPath();
        c.moveTo(12, 0);
        c.lineTo(-8, -4);
        c.lineTo(-3, 0);
        c.lineTo(-8, 4);
        c.closePath();
        c.fill();
        c.restore();
      }
      sparks((t - profile.impactAt) / 0.3, 5);
      break;
    }
    case "adept": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (t < profile.fireAt) ring(from, 8 + t * 30, t / profile.fireAt);
      if (u >= 0 && u <= 1) {
        const p = projectilePoint(from, to, u, 35);
        c.save();
        c.translate(p.x, p.y);
        c.rotate(angle + u * Math.PI);
        c.fillRect(-6, -10, 12, 20);
        c.strokeStyle = "#436e5c";
        c.strokeRect(-3, -6, 6, 12);
        c.restore();
      }
      if (u > 1) sparks((t - profile.impactAt) / 0.28, 5);
      break;
    }
    case "dragonfly": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1)
        for (let i = 0; i < 3; i++) {
          const p = projectilePoint(from, to, Math.max(0, u - i * 0.1));
          ring(p, (6 + i * 4) * power, 1 - i * 0.22);
        }
      if (u > 1) {
        ring(to, 20 + (u - 1) * 32, Math.max(0, 2 - u));
        sparks((t - profile.impactAt) / 0.35, 5);
      }
      break;
    }
    case "tiger": {
      if (t < profile.fireAt) {
        c.save();
        c.translate(from.x, from.y);
        c.rotate(angle);
        c.beginPath();
        c.arc(0, 0, 13 + t * 20, -1.2, 1.2);
        c.stroke();
        c.restore();
      }
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1)
        for (let i = 0; i < (skill ? 5 : 1); i++) {
          const end = {
            x: to.x + (skill ? (i - 2) * 15 : 0),
            y: to.y + (skill ? Math.abs(i - 2) * 7 : 0),
          };
          const tip = projectilePoint(from, end, u, 55 * power),
            tail = projectilePoint(
              from,
              end,
              Math.max(0, u - 0.12),
              55 * power,
            );
          line(tail, tip, 2.5);
          c.beginPath();
          c.arc(tip.x, tip.y, 2.5, 0, Math.PI * 2);
          c.fill();
        }
      if (u > 1) sparks((t - profile.impactAt) / 0.28, skill ? 12 : 4);
      break;
    }
    case "fish": {
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        const p = projectilePoint(from, to, u, 30),
          radius = (5 + 2 * Math.sin(u * Math.PI)) * power;
        c.beginPath();
        c.arc(p.x, p.y, radius, 0, Math.PI * 2);
        c.fill();
        ring(p, radius * 1.8, 0.6);
      }
      if (u > 1) ring(to, 6 + (u - 1) * 30, Math.max(0, 2 - u));
      break;
    }
    case "deer": {
      if (t < profile.fireAt)
        for (let i = 0; i < 3; i++)
          ring(
            { x: from.x, y: from.y - i * 8 },
            6 + t * 24,
            t / profile.fireAt,
          );
      const u = (t - profile.fireAt) / (profile.impactAt - profile.fireAt);
      if (u >= 0 && u <= 1) {
        const tip = projectilePoint(from, to, u, 15);
        line(
          projectilePoint(from, to, Math.max(0, u - 0.3), 15),
          tip,
          4 * power,
          0.7,
        );
        c.fillRect(tip.x - 4, tip.y - 4, 8, 8);
      }
      if (u > 1) sparks((t - profile.impactAt) / 0.28, 6);
      break;
    }
    case "infantry":
      for (const start of [0.15, 0.34, 0.53]) {
        const u = (t - start) / 0.14;
        if (u >= 0 && u <= 1) {
          const a = projectilePoint(from, to, Math.max(0, u - 0.14)),
            b = projectilePoint(from, to, u);
          line(a, b, 2 * power);
          flash(1 - u);
        }
        const casing = (t - start) / 0.32;
        if (casing >= 0 && casing <= 1) {
          c.save();
          c.globalAlpha = 1 - casing;
          c.fillStyle = "#e8b958";
          c.translate(
            from.x - 12 - casing * 25,
            from.y + Math.sin(casing * Math.PI) * -15 + casing * 15,
          );
          c.rotate(casing * 8);
          c.fillRect(-3, -1, 6, 2);
          c.restore();
        }
        sparks((t - start - 0.14) / 0.2, 4);
      }
      break;
    case "sniper":
      if (t < 0.4) {
        line(from, to, 1, Math.sin((t / 0.4) * Math.PI) * 0.5);
        c.save();
        c.globalAlpha = t / 0.4;
        c.lineWidth = 1;
        const r = 20 * (1 - t / 0.5);
        c.beginPath();
        c.arc(to.x, to.y, r, 0, Math.PI * 2);
        c.moveTo(to.x - r - 5, to.y);
        c.lineTo(to.x + r + 5, to.y);
        c.moveTo(to.x, to.y - r - 5);
        c.lineTo(to.x, to.y + r + 5);
        c.stroke();
        c.restore();
      }
      if (t >= 0.4 && t < 0.54) {
        const u = (t - 0.4) / 0.14;
        line(
          projectilePoint(from, to, Math.max(0, u - 0.35)),
          projectilePoint(from, to, u),
          3 * power,
        );
        flash(1 - u * 0.6);
      }
      if (t >= 0.54) {
        const fade = 1 - (t - 0.54) / 0.46;
        line(from, to, 1, fade * 0.25);
        ring(to, 8 + (t - 0.54) * 38, fade);
        sparks((t - 0.54) / 0.4, 9);
      }
      break;
    case "chariot": {
      const u = (t - 0.22) / 0.48;
      if (u >= 0 && u <= 1) {
        const arc = 90 * power,
          p = projectilePoint(from, to, u, arc);
        for (let i = 1; i <= 6; i++) {
          const trail = projectilePoint(
            from,
            to,
            Math.max(0, u - i * 0.035),
            arc,
          );
          c.save();
          c.globalAlpha = (1 - i / 7) * 0.25;
          c.fillStyle = "#c6bca9";
          c.beginPath();
          c.arc(trail.x, trail.y, 2 + i * 0.8, 0, Math.PI * 2);
          c.fill();
          c.restore();
        }
        c.fillStyle = "#ffcc79";
        c.beginPath();
        c.arc(p.x, p.y, 5 * power, 0, Math.PI * 2);
        c.fill();
        flash(Math.max(0, 1 - u * 4));
      }
      if (t >= 0.7) {
        const v = (t - 0.7) / 0.3;
        c.save();
        c.globalAlpha = 1 - v;
        const g = c.createRadialGradient(
          to.x,
          to.y,
          0,
          to.x,
          to.y,
          Math.max(1, 38 * v + 12) * power,
        );
        g.addColorStop(0, "#fff5c9");
        g.addColorStop(0.3, "#ffb755cc");
        g.addColorStop(1, "#ec704000");
        c.fillStyle = g;
        c.beginPath();
        c.arc(to.x, to.y, (38 * v + 12) * power, 0, Math.PI * 2);
        c.fill();
        c.restore();
        ring(to, (15 + v * 46) * power, 1 - v);
        sparks(v, 12);
      }
      break;
    }
    case "cannon": {
      if (t < 0.43) {
        const charge = t / 0.43;
        c.save();
        c.globalAlpha = charge;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(from.x, from.y, 5 + charge * 12 * power, 0, Math.PI * 2);
        c.stroke();
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5 + t * 9,
            r = 32 * (1 - charge) + 8;
          c.beginPath();
          c.arc(
            from.x + Math.cos(a) * r,
            from.y + Math.sin(a) * r,
            2,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
        c.restore();
      }
      if (t >= 0.43 && t < 0.78) {
        const fade = Math.max(0, 1 - (t - 0.43) / 0.35);
        line(from, to, 15 * power, fade * 0.25);
        line(from, to, 6 * power, fade);
        c.save();
        c.strokeStyle = "#e6ffff";
        line(from, to, 2.5 * power, fade);
        c.restore();
        ring(from, 12 + (t - 0.43) * 40, fade);
        ring(to, 15 + (t - 0.43) * 65, fade);
        sparks((t - 0.48) / 0.4, 10);
      }
      break;
    }
  }
  c.restore();
}
