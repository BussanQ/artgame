import { skillReady, concealed, attackTargets } from "./triggers";
import { equipmentStats } from "../data/items";
import { RULES, UNIT } from "../data/units";
import { synergies, traitBonuses } from "./synergies";
import {
  castSkill,
  damage,
  distance,
  attackInterval,
  gainMana,
} from "./abilities";
import { SKILLS } from "../data/skills";
import type {
  Battle,
  Fighter,
  Piece,
  CombatEvent,
  CombatEffect,
  CombatVersion,
} from "./types";
export function army(
  pieces: Piece[],
  side: 0 | 1,
  version: CombatVersion = "signature",
): Fighter[] {
  const bonuses = traitBonuses(pieces, version);
  const active = new Set(
    synergies(pieces, "legacy")
      .filter((s) => s.active)
      .map((s) => s.trait),
  );
  return pieces
    .filter((p) => p.position !== null)
    .map((p) => {
      const d = UNIT[p.defId],
        scale = 2 ** (p.star - 1) * (p.encounterPower ?? 1),
        gear = equipmentStats(p.items),
        has = (t: (typeof d.traits)[number]) =>
          d.traits.includes(t) && active.has(t);
      const sum = (
        key:
          | "hp"
          | "armor"
          | "interval"
          | "mana"
          | "shield"
          | "attack"
          | "regen"
          | "skillPower"
          | "shred",
        // New traits only apply to the newly introduced units.
      ) => d.traits.reduce((n, t) => n + (bonuses.get(t)?.[key] ?? 0), 0);
      const hp = Math.round(
        d.hp * scale +
          gear.hp +
          (version === "legacy" ? (has("步兵") ? 200 : 0) : sum("hp")),
      );
      const pos = p.position!;
      return {
        ...(version === "signature"
          ? { signature: { casts: 0, attacks: 0, concealed: false } }
          : {}),
        uid: p.uid,
        defId: p.defId,
        star: p.star,
        side,
        x: side === 0 ? pos % 8 : 7 - (pos % 8),
        y: side === 0 ? Math.floor(pos / 8) : 7 - Math.floor(pos / 8),
        hp,
        maxHp: hp,
        attack:
          (d.attack * scale + gear.attack) *
          (version === "legacy"
            ? (has("狙击") ? 1.25 : 1) * (has("刺杀") ? 1.35 : 1)
            : 1 + sum("attack")),
        armor:
          d.armor +
          gear.armor +
          (version === "legacy" ? (has("装甲") ? 4 : 0) : sum("armor")),
        range: d.range,
        interval: Math.max(
          1,
          d.interval * (1 - gear.haste) -
            (version === "legacy" ? (has("野兽") ? 1 : 0) : sum("interval")),
        ),
        cooldown: 0,
        mana:
          version === "signature" &&
          ["cavalry", "turtle", "tiger"].includes(p.defId)
            ? 0
            : Math.min(
                100,
                (version === "legacy" ? (has("熊猫") ? 100 : 0) : sum("mana")) +
                  gear.mana +
                  (d.initialMana ?? 0),
              ),
        lifesteal: gear.lifesteal,
        skillPower:
          1 + gear.skillPower + (version === "legacy" ? 0 : sum("skillPower")),
        regeneration:
          version === "legacy" ? (has("先锋") ? 8 : 0) : sum("regen"),
        attackShred: version === "legacy" ? 0 : sum("shred"),
        supportHeal:
          version === "legacy"
            ? 0
            : d.traits.includes("支援")
              ? (bonuses.get("支援")?.supportHeal ?? 0)
              : 0,
        supportMana:
          version === "legacy"
            ? 0
            : d.traits.includes("支援")
              ? (bonuses.get("支援")?.supportMana ?? 0)
              : 0,
        armorBuff: 0,
        armorBuffUntil: 0,
        manaLockUntil: 0,
        magicResist: 0.2 + gear.magicResist,
        damage: 0,
        flash: false,
        shield: version === "legacy" ? (has("护卫") ? 250 : 0) : sum("shield"),
        shieldUntil: RULES.maxTicks + 1,
        stunUntil: 0,
        hasteUntil: 0,
        armorBreak: 0,
        armorBreakUntil: 0,
        healing: 0,
        absorbed: 0,
      };
    });
}
export function openingJumps(
  fighters: Fighter[],
  pieces: Piece[][],
  version: CombatVersion,
) {
  if (version === "legacy") return;
  for (const f of fighters
    .filter(
      (f) =>
        UNIT[f.defId].traits.includes("刺杀") &&
        synergies(pieces[f.side], version).some(
          (s) => s.trait === "刺杀" && s.active,
        ),
    )
    .sort((a, b) => a.uid - b.uid)) {
    const targets = fighters
      .filter((e) => e.side !== f.side)
      .sort(
        (a, b) =>
          Number(b.range > 1) - Number(a.range > 1) ||
          distance(f, b) - distance(f, a) ||
          a.uid - b.uid,
      );
    for (const target of targets) {
      const cell = [
        [0, 1],
        [1, 0],
        [-1, 0],
        [0, -1],
      ]
        .map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy }))
        .find(
          (p) =>
            p.x >= 0 &&
            p.x < 8 &&
            p.y >= 0 &&
            p.y < 8 &&
            !fighters.some((e) => e.hp > 0 && e.x === p.x && e.y === p.y),
        );
      if (cell) {
        f.x = cell.x;
        f.y = cell.y;
        break;
      }
    }
  }
}
function runBattle(
  left: Piece[],
  right: Piece[],
  version: CombatVersion,
  recordFrames: boolean,
): Battle {
  const fighters = [...army(left, 0, version), ...army(right, 1, version)];
  openingJumps(fighters, [left, right], version);
  for (const f of fighters)
    if (f.signature) f.signature.concealed = concealed(f, fighters);
  const frames: Battle["frames"] = recordFrames
    ? [
        {
          tick: 0,
          fighters: structuredClone(fighters),
          events: [],
          effects: [],
        },
      ]
    : [];
  let lastTick = 0;
  for (let tick = 1; tick <= RULES.maxTicks; tick++) {
    if (
      !fighters.some((f) => f.side === 0 && f.hp > 0) ||
      !fighters.some((f) => f.side === 1 && f.hp > 0)
    )
      break;
    const events: CombatEvent[] = [];
    const effects: CombatEffect[] = [];
    const context = { fighters, tick, events, effects };
    for (const f of fighters) {
      f.flash = false;
      if (f.shieldUntil <= tick) f.shield = 0;
      if (f.armorBreakUntil <= tick) f.armorBreak = 0;
      if (f.armorBuffUntil <= tick) f.armorBuff = 0;
    }
    // Alternate initiative each tick to avoid permanent left-side first-action priority.
    const order = tick % 2 ? [...fighters].reverse() : fighters;
    for (const f of order) {
      if (f.hp <= 0) continue;
      if (f.regeneration) f.hp = Math.min(f.maxHp, f.hp + f.regeneration);
      const enemies = attackTargets(f, fighters).sort(
        (a, b) => distance(f, a) - distance(f, b) || a.uid - b.uid,
      );
      const target = enemies[0];
      if (!target) continue;
      if (f.cooldown > 0) f.cooldown--;
      if (f.cooldown > 0) continue;
      if (f.stunUntil > tick) continue;
      const injuredAlly =
        f.defId === "monk" &&
        fighters.some(
          (a) =>
            a.side === f.side &&
            a.hp > 0 &&
            a.hp < a.maxHp &&
            distance(f, a) <= SKILLS.monk.radius,
        );
      const canCast =
        skillReady(f) &&
        (f.defId !== "monk" || injuredAlly) &&
        (distance(f, target) <= f.range ||
          injuredAlly ||
          f.defId === "panda" ||
          [
            "wolf",
            "cavalry",
            "bull",
            "shadowblade",
            "turtle",
            "fish",
            "deer",
          ].includes(f.defId));
      if (canCast && castSkill(context, f, target)) {
        f.cooldown += attackInterval(f, tick);
      } else if (distance(f, target) > f.range) {
        f.cooldown = 0;
        const occupied = new Set(
          fighters.filter((e) => e.hp > 0).map((e) => `${e.x},${e.y}`),
        );
        // BFS finds a free attack position, including detours around allies.
        const queue = [
            { x: f.x, y: f.y, first: null as { x: number; y: number } | null },
          ],
          seen = new Set([`${f.x},${f.y}`]);
        while (queue.length) {
          const at = queue.shift()!;
          if (
            at.first &&
            Math.abs(at.x - target.x) + Math.abs(at.y - target.y) <= f.range
          ) {
            f.x = at.first.x;
            f.y = at.first.y;
            break;
          }
          for (const [dx, dy] of [
            [0, -1],
            [-1, 0],
            [1, 0],
            [0, 1],
          ]) {
            const x = at.x + dx,
              y = at.y + dy,
              key = `${x},${y}`;
            if (
              x < 0 ||
              x > 7 ||
              y < 0 ||
              y > 7 ||
              seen.has(key) ||
              occupied.has(key)
            )
              continue;
            seen.add(key);
            queue.push({ x, y, first: at.first ?? { x, y } });
          }
        }
      } else {
        if (f.signature) f.signature.attacks++;
        gainMana(f, 25, tick);
        damage(context, f, target, f.attack);
        f.cooldown += attackInterval(f, tick);
      }
    }
    for (const f of fighters)
      if (f.signature) f.signature.concealed = concealed(f, fighters);
    lastTick = tick;
    if (recordFrames)
      frames.push({
        tick,
        fighters: structuredClone(fighters),
        events,
        effects,
      });
  }
  if (!recordFrames)
    frames.push({
      tick: lastTick,
      fighters: structuredClone(fighters),
      events: [],
      effects: [],
    });
  const alive = [0, 1].map((side) =>
    fighters.filter((f) => f.side === side && f.hp > 0),
  );
  const winner =
    alive[0].length && !alive[1].length
      ? 0
      : alive[1].length && !alive[0].length
        ? 1
        : null;
  return {
    frames,
    winner,
    damage:
      winner === null ? 3 : 2 + alive[winner].reduce((n, f) => n + f.star, 0),
  };
}

/** Full playback snapshots for the actual battle and saved replays. */
export function simulate(
  left: Piece[],
  right: Piece[],
  version: CombatVersion = "signature",
): Battle {
  return runBattle(left, right, version, true);
}
/** Same combat rules without allocating every animation snapshot during AI search. */
export function simulateOutcome(
  left: Piece[],
  right: Piece[],
  version: CombatVersion = "signature",
) {
  const battle = runBattle(left, right, version, false);
  return {
    winner: battle.winner,
    damage: battle.damage,
    final: battle.frames[0],
  };
}
