import { RULES } from "../data/units";
import { isUndying } from "./immortality";
import type { Battle, Fighter } from "./types";

export type BattleMetric = "damage" | "received" | "healing" | "absorbed";
export interface UnitContribution {
  rifle?:Fighter["rifle"];
  thornbind?:Pick<NonNullable<Fighter["thornbind"]>,"pulses"|"hits"|"roots"|"healing"|"retargets"|"interrupted">;
  boneblast?: Pick<NonNullable<Fighter["boneblast"]>, "launched" | "detonated" | "hits" | "stuns" | "interrupted">;
  wildfire?: Pick<NonNullable<Fighter["wildfire"]>, "formed" | "pulses" | "hits" | "interrupted" | "eggs" | "hatches" | "brokenEggs">;
  tornado?: Pick<NonNullable<Fighter["tornado"]>, "launched" | "contacts" | "knockups" | "landings">;
  warcry?: Pick<NonNullable<Fighter["warcry"]>, "roars" | "petrified" | "retaliations" | "retaliationDamage" | "retaliationShield">;
  terminator?: Pick<NonNullable<Fighter["terminator"]>, "smallLaunched" | "largeLaunched" | "detonated" | "hits">;
  bombardment?: Pick<NonNullable<Fighter["bombardment"]>, "launched" | "hits">;
  secretOrb?: Pick<NonNullable<Fighter["secretOrb"]>,"formed"|"pulses"|"hits"|"energyRemoved"|"interrupted">;
  shuriken?: Pick<NonNullable<Fighter["shuriken"]>, "launched" | "landings" | "pulses" | "hits" | "interrupted">;
  wushi?: Fighter["wushi"];
  jungle?: Fighter["jungle"];
  storm?: Pick<NonNullable<Fighter["storm"]>, "launched" | "hits" | "energyRemoved">;
  gospelAura?: Fighter["gospelAura"];
  lightning?: { attacks: number; bounces: number; damage: number };
  tar?: Pick<NonNullable<Fighter["tar"]>, "launched" | "detonated">;
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
    ...(f.rifle?{rifle:{shots:f.rifle.shots}}:{}),
    ...(f.thornbind?{thornbind:{pulses:f.thornbind.pulses,hits:f.thornbind.hits,roots:f.thornbind.roots,
      healing:f.thornbind.healing,retargets:f.thornbind.retargets,interrupted:f.thornbind.interrupted}}:{}),
    ...(f.boneblast ? {boneblast:{launched:f.boneblast.launched,detonated:f.boneblast.detonated,
      hits:f.boneblast.hits,stuns:f.boneblast.stuns,interrupted:f.boneblast.interrupted}} : {}),
    ...(f.wildfire ? {wildfire:{formed:f.wildfire.formed,pulses:f.wildfire.pulses,hits:f.wildfire.hits,
      interrupted:f.wildfire.interrupted,eggs:f.wildfire.eggs,hatches:f.wildfire.hatches,brokenEggs:f.wildfire.brokenEggs}} : {}),
    ...(f.tornado ? {tornado:{launched:f.tornado.launched,contacts:f.tornado.contacts,
      knockups:f.tornado.knockups,landings:f.tornado.landings}} : {}),
    ...(f.warcry ? {warcry:{roars:f.warcry.roars,petrified:f.warcry.petrified,
      retaliations:f.warcry.retaliations,retaliationDamage:f.warcry.retaliationDamage,
      retaliationShield:f.warcry.retaliationShield}} : {}),
    ...(f.terminator ? { terminator: { smallLaunched: f.terminator.smallLaunched,
      largeLaunched: f.terminator.largeLaunched, detonated: f.terminator.detonated, hits: f.terminator.hits } } : {}),
    ...(f.bombardment ? { bombardment: { launched: f.bombardment.launched, hits: f.bombardment.hits } } : {}),
    ...(f.secretOrb ? {secretOrb:{formed:f.secretOrb.formed,pulses:f.secretOrb.pulses,
      hits:f.secretOrb.hits,energyRemoved:f.secretOrb.energyRemoved,interrupted:f.secretOrb.interrupted}} : {}),
    ...(f.shuriken ? { shuriken: { launched:f.shuriken.launched,landings:f.shuriken.landings,
      pulses:f.shuriken.pulses,hits:f.shuriken.hits,interrupted:f.shuriken.interrupted } } : {}),
    ...(f.wushi ? { wushi: structuredClone(f.wushi) } : {}),
    ...(f.jungle ? { jungle: { ...f.jungle } } : {}),
    ...(f.storm ? { storm: { launched: f.storm.launched, hits: f.storm.hits,
      energyRemoved: f.storm.energyRemoved } } : {}),
    ...(f.gospelAura ? { gospelAura: structuredClone(f.gospelAura) } : {}),
    ...(f.lightningChain
      ? { lightning: { attacks: 0, bounces: 0, damage: 0 } }
      : {}),
    ...(f.tar
      ? { tar: { launched: f.tar.launched, detonated: f.tar.detonated } }
      : {}),
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
        if (source.lightning && event.chainHop !== undefined) {
          if (event.chainHop === 0) source.lightning.attacks++;
          else {
            source.lightning.bounces++;
            source.lightning.damage += event.amount;
          }
        }
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
        if (["施法中断", "蓄力中断", "飞镖蓄力中断", "秘法球中断"].includes(effect.name))
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
