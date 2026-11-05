import { RULES } from "../data/units";
import { isUndying } from "./immortality";
import type { Battle, Fighter } from "./types";

export type BattleMetric = "damage" | "received" | "healing" | "absorbed";
export interface UnitContribution {
  taotie?: Fighter["taotie"];
  aurora?: Fighter["aurora"];
  qiSkill?: true;
  interruptions: number;
  lostTargets: number;
  armorApplications?: number;
  knockups?: number;
  peakGale?: number;
  criticalHits?: number;
  phoenix?: Fighter["phoenix"];
  hawkForm?: Fighter["hawkForm"];
  undying?: boolean;
  summon?: Fighter["summon"];
  uid: number;
  defId: string;
  star: number;
  side: 0 | 1;
  hp: number;
  maxHp: number;
  damage: number;
  normalDamage: number;
  skillDamage: number;
  reflectedDamage: number;
  energyGiven: number;
  shieldDamage: number;
  received: number;
  healing: number;
  absorbed: number;
  casts: number;
  evades: number;
}
function contribution(f: Fighter): UnitContribution {
  return {
    ...(f.taotie ? { taotie: structuredClone(f.taotie) } : {}),
    ...(f.aurora ? { aurora: { ...f.aurora } } : {}),
    ...(f.qiSkill ? { qiSkill: true as const } : {}),
    interruptions: 0,
    lostTargets: 0,
    ...(f.defId === "venombeast" ? { armorApplications: 0 } : {}),
    ...(f.defId === "elephant" || f.burrowSkill ? { knockups: 0 } : {}),
    ...(f.gale ? { peakGale: 0 } : {}),
    ...(f.bladeCrit || f.assassinCrit ? { criticalHits: 0 } : {}),
    ...(f.phoenix ? { phoenix: { ...f.phoenix } } : {}),
    ...(f.hawkForm ? { hawkForm: { ...f.hawkForm } } : {}),
    ...(isUndying(f) ? { undying: true } : {}),
    ...(f.summon ? { summon: { ...f.summon } } : {}),
    uid: f.uid,
    defId: f.defId,
    star: f.star,
    side: f.homeSide ?? f.side,
    hp: isUndying(f) ? 0 : f.hp,
    maxHp: f.maxHp,
    damage: 0,
    normalDamage: 0,
    skillDamage: 0,
    reflectedDamage: 0,
    energyGiven: 0,
    shieldDamage: 0,
    received: 0,
    healing: f.healing,
    absorbed: 0,
    casts: 0,
    evades: 0,
  };
}

/** Inspect only frames up to the requested point. Never mutate a replay or reveal its future. */
export function analyzeBattle(battle: Battle, at = battle.frames.length - 1) {
  const index = Math.max(
    0,
    Math.min(
      battle.frames.length - 1,
      Number.isFinite(at) ? Math.floor(at) : 0,
    ),
  );
  const frame = battle.frames[index];
  const rows = (frame?.fighters ?? []).map(contribution);
  const units = new Map(rows.map((row) => [row.uid, row]));
  for (let i = 0; i <= index && i < battle.frames.length; i++) {
    for (const event of battle.frames[i].events) {
      const source = units.get(event.attacker),
        target = units.get(event.target);
      if (source) {
        if (source.peakGale !== undefined)
          source.peakGale = Math.max(source.peakGale, event.gale ?? 0);
        source.damage += event.amount;
        source[
          event.reflected
            ? "reflectedDamage"
            : event.skill
              ? "skillDamage"
              : "normalDamage"
        ] += event.amount;
        source.shieldDamage += event.absorbed;
        if (
          source.criticalHits !== undefined &&
          event.empowered &&
          !event.skill &&
          !event.evaded &&
          !event.immune
        )
          source.criticalHits++;
      }
      if (target) {
        if (event.evaded) target.evades++;
        target.received += event.amount;
        target.absorbed += event.absorbed;
      }
    }
    for (const effect of battle.frames[i].effects) {
      const source = units.get(effect.source);
      if (source && effect.kind === "cast") source.casts++;
      if (source && effect.kind === "silence") {
        if (["施法中断", "蓄力中断"].includes(effect.name))
          source.interruptions++;
        if (effect.name === "目标丢失") source.lostTargets++;
      }
      if (source && effect.kind === "energize")
        source.energyGiven += effect.amount;
      if (
        source?.armorApplications !== undefined &&
        effect.kind === "break" &&
        effect.name === "酸性减甲"
      )
        source.armorApplications++;
      if (
        source?.knockups !== undefined &&
        effect.kind === "stun" &&
        effect.name === "击飞"
      )
        source.knockups++;
    }
  }
  const sides = ([0, 1] as const).map((side) => {
    const fighters = rows.filter((row) => row.side === side);
    return {
      side,
      fighters,
      survivors: fighters.filter((row) => row.hp > 0).length,
      souls: fighters.filter((row) => row.undying).length,
      damage: fighters.reduce((n, row) => n + row.damage, 0),
      received: fighters.reduce((n, row) => n + row.received, 0),
      healing: fighters.reduce((n, row) => n + row.healing, 0),
      absorbed: fighters.reduce((n, row) => n + row.absorbed, 0),
    };
  });
  const complete = !!frame && index === battle.frames.length - 1;
  return {
    index,
    seconds: (frame?.tick ?? 0) * RULES.tickSeconds,
    complete,
    winner: complete ? battle.winner : undefined,
    sides,
  };
}
export type BattleAnalysis = ReturnType<typeof analyzeBattle>;
