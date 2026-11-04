import { bladeStormActive } from "./swordthrall";
import { isPhoenixEgg } from "./phoenix";
import type { CombatContext } from "./abilities";
import type { Fighter } from "./types";
import { UNIT } from "../data/units";

export const SPIRIT_WOLF = { hp: 400, attack: 40, armor: 2, interval: 3 };
export function fighterName(
  f: Pick<Fighter, "defId" | "summon" | "hawkForm" | "phoenix">,
) {
  if (f.summon?.kind === "puppet") return "灵木傀儡";
  if (f.summon?.kind === "sentinel") return "镇海盾卫";
  return f.summon ? "幽影幼狼" : UNIT[f.defId].name;
}
export function fighterSprite(
  f: Pick<Fighter, "defId" | "summon" | "hawkForm" | "phoenix">,
) {
  if (isPhoenixEgg(f)) return "phoenix-egg";
  if (f.hawkForm?.active) return "bloodhawk-ground";
  if (f.summon?.kind === "puppet") return "puppet-spirit";
  if (f.summon?.kind === "sentinel") return "shield-servant";
  return f.summon ? "wolf-spirit" : f.defId;
}

/** Each wolf calls at most two spirits once. Only transient combat fighters are created. */
export function callWolfPack(ctx: CombatContext, source: Fighter): boolean {
  if (
    source.packCall !== "ready" ||
    source.mana < 100 ||
    source.hp <= 0 ||
    source.summon
  )
    return false;
  const forward = source.side === 0 ? -1 : 1;
  const cells = [
    [0, forward],
    [-1, 0],
    [1, 0],
    [0, -forward],
  ]
    .map(([dx, dy]) => ({ x: source.x + dx, y: source.y + dy }))
    .filter(
      (p) =>
        p.x >= 0 &&
        p.x < 8 &&
        p.y >= 0 &&
        p.y < 8 &&
        !ctx.fighters.some((f) => f.hp > 0 && f.x === p.x && f.y === p.y),
    )
    .slice(0, 2);
  if (!cells.length) return false;
  const scale = 2 ** (source.star - 1) * source.skillPower;
  let uid = Math.min(0, ...ctx.fighters.map((f) => f.uid)) - 1;
  for (const cell of cells) {
    const hp = Math.round(SPIRIT_WOLF.hp * scale);
    const pup: Fighter = {
      ...(source.infantryArmorBreak
        ? { infantryArmorBreak: source.infantryArmorBreak }
        : {}),
      ...(source.reflection ? { reflection: source.reflection } : {}),
      uid: uid--,
      defId: "wolf",
      star: source.star,
      side: source.side,
      ...(source.air
        ? {
            homeSide: source.homeSide ?? source.side,
            air: {
              flying: false,
              evasion: 0,
              attempts: 0,
              seaMana: 0,
              seaTick: -1,
              siege: source.air.siege,
              magicBreak: source.air.magicBreak,
              antiAir: false,
              phaseUntil: 0,
            },
          }
        : {}),
      ...cell,
      summon: { owner: source.uid, born: ctx.tick },
      signature: { casts: 0, attacks: 0, concealed: false },
      hp,
      maxHp: hp,
      attack: Math.round(SPIRIT_WOLF.attack * scale),
      armor: SPIRIT_WOLF.armor,
      range: 1,
      interval: SPIRIT_WOLF.interval,
      cooldown: 0,
      mana: 0,
      damage: 0,
      flash: false,
      shield: 0,
      shieldUntil: 0,
      stunUntil: 0,
      hasteUntil: 0,
      armorBreak: 0,
      armorBreakUntil: 0,
      healing: 0,
      absorbed: 0,
      lifesteal: 0,
      skillPower: 1,
      magicResist: Math.max(
        -0.25,
        0.2 + (source.summonWard ?? 0) - (source.air?.magicBreak ?? 0),
      ),
      regeneration: 0,
      attackShred: 0,
      armorBuff: 0,
      armorBuffUntil: 0,
      manaLockUntil: 0,
      supportHeal: 0,
      supportMana: 0,
    };
    ctx.fighters.push(pup);
    ctx.effects.push({
      source: source.uid,
      target: pup.uid,
      kind: "teleport",
      amount: 1,
      name: "幽狼现身",
      from: { x: source.x, y: source.y },
      to: cell,
    });
  }
  source.mana = 0;
  source.packCall = "spent";
  if (source.signature) source.signature.casts++;
  source.flash = true;
  ctx.effects.push({
    source: source.uid,
    target: source.uid,
    kind: "cast",
    amount: 1,
    name: "幽狼召唤",
    from: { x: source.x, y: source.y },
    to: { x: source.x, y: source.y },
  });
  return true;
}

export function summonOwnerName(f: Pick<Fighter, "summon">) {
  return f.summon?.kind === "puppet"
    ? "真人"
    : f.summon?.kind === "sentinel"
      ? "须弥鲨"
      : "鬼狼";
}
export const RETINUE = {
  puppet: {
    hp: 380,
    attack: 48,
    armor: 3,
    interval: 3,
    defId: "panda",
    count: 1,
  },
  sentinel: {
    hp: 800,
    attack: 45,
    armor: 8,
    interval: 4,
    defId: "guard",
    count: 2,
  },
};
/** An adept replenishes at most two living puppets; a shark calls its guard once. */
export function callRetinue(ctx: CombatContext, source: Fighter): boolean {
  const state = source.summoning;
  if (
    !state ||
    state.spent ||
    ctx.tick < state.readyAt ||
    source.mana < 100 ||
    source.hp <= 0 ||
    source.summon
  )
    return false;
  const profile = RETINUE[state.kind];
  const capacity =
    state.kind === "puppet"
      ? 2 -
        ctx.fighters.filter((f) => f.hp > 0 && f.summon?.owner === source.uid)
          .length
      : profile.count;
  const forward = source.side === 0 ? -1 : 1;
  const cells = [
    [0, forward],
    [-1, 0],
    [1, 0],
    [0, -forward],
  ]
    .map(([dx, dy]) => ({ x: source.x + dx, y: source.y + dy }))
    .filter(
      (p) =>
        p.x >= 0 &&
        p.x < 8 &&
        p.y >= 0 &&
        p.y < 8 &&
        !ctx.fighters.some((f) => f.hp > 0 && f.x === p.x && f.y === p.y),
    )
    .slice(0, Math.max(0, Math.min(capacity, profile.count)));
  if (!cells.length) return false;
  const scale = 2 ** (source.star - 1) * source.skillPower;
  let uid = Math.min(0, ...ctx.fighters.map((f) => f.uid)) - 1;
  for (const cell of cells) {
    const hp = Math.round(profile.hp * scale);
    ctx.fighters.push({
      ...(source.infantryArmorBreak
        ? { infantryArmorBreak: source.infantryArmorBreak }
        : {}),
      ...(source.reflection ? { reflection: source.reflection } : {}),
      uid: uid--,
      defId: profile.defId,
      star: source.star,
      side: source.side,
      ...(source.air
        ? {
            homeSide: source.homeSide ?? source.side,
            air: {
              flying: false,
              evasion: 0,
              attempts: 0,
              seaMana: 0,
              seaTick: -1,
              siege: source.air.siege,
              magicBreak: source.air.magicBreak,
              antiAir: false,
              phaseUntil: 0,
            },
          }
        : {}),
      ...cell,
      summon: { owner: source.uid, born: ctx.tick, kind: state.kind },
      signature: { casts: 0, attacks: 0, concealed: false },
      hp,
      maxHp: hp,
      attack: Math.round(profile.attack * scale),
      armor: profile.armor,
      range: 1,
      interval: profile.interval,
      cooldown: 0,
      mana: 0,
      damage: 0,
      flash: false,
      shield: 0,
      shieldUntil: 0,
      stunUntil: 0,
      hasteUntil: 0,
      armorBreak: 0,
      armorBreakUntil: 0,
      healing: 0,
      absorbed: 0,
      lifesteal: 0,
      skillPower: 1,
      magicResist: Math.max(
        -0.25,
        0.2 + (source.summonWard ?? 0) - (source.air?.magicBreak ?? 0),
      ),
      regeneration: 0,
      attackShred: 0,
      armorBuff: 0,
      armorBuffUntil: 0,
      manaLockUntil: 0,
      supportHeal: 0,
      supportMana: 0,
    });
    ctx.effects.push({
      source: source.uid,
      target: uid + 1,
      kind: "teleport",
      amount: 1,
      name: state.kind === "puppet" ? "傀儡化生" : "盾卫降临",
      from: { x: source.x, y: source.y },
      to: cell,
    });
  }
  if (state.kind === "sentinel") {
    // One landing stun per enemy, even if both guards land beside it.
    for (const enemy of ctx.fighters.filter(
      (f) =>
        f.side !== source.side &&
        f.hp > 0 &&
        cells.some((p) => Math.abs(p.x - f.x) + Math.abs(p.y - f.y) <= 1),
    )) {
      if (bladeStormActive(enemy, ctx.tick)) continue;
      if (enemy.air) delete enemy.air.cast;
      enemy.stunUntil = Math.max(enemy.stunUntil, ctx.tick + 2);
      ctx.effects.push({
        source: source.uid,
        target: enemy.uid,
        kind: "stun",
        amount: 1,
        name: "镇海震击",
        from: { x: source.x, y: source.y },
        to: { x: enemy.x, y: enemy.y },
      });
    }
    state.spent = true;
  }
  state.readyAt = ctx.tick + 32;
  source.mana = 0;
  source.flash = true;
  if (source.signature) source.signature.casts++;
  ctx.effects.push({
    source: source.uid,
    target: source.uid,
    kind: "cast",
    amount: 1,
    name: state.kind === "puppet" ? "灵木化生" : "镇海卫阵",
    from: { x: source.x, y: source.y },
    to: { x: source.x, y: source.y },
  });
  return true;
}
