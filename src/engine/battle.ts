import { RULES, UNIT } from "../data/units";
import { synergies } from "./synergies";
import type { Battle, Fighter, Piece, CombatEvent } from "./types";
const distance = (a: Fighter, b: Fighter) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
function army(pieces: Piece[], side: 0 | 1): Fighter[] {
  const active = new Set(
    synergies(pieces)
      .filter((s) => s.active)
      .map((s) => s.trait),
  );
  return pieces
    .filter((p) => p.position !== null)
    .map((p) => {
      const d = UNIT[p.defId],
        scale = 2 ** (p.star - 1),
        has = (t: (typeof d.traits)[number]) =>
          d.traits.includes(t) && active.has(t);
      const hp =
        d.hp * scale + (has("步兵") ? 200 : 0) + (has("护卫") ? 250 : 0);
      const pos = p.position!;
      return {
        uid: p.uid,
        defId: p.defId,
        star: p.star,
        side,
        x: side === 0 ? pos % 8 : 7 - (pos % 8),
        y: side === 0 ? Math.floor(pos / 8) : 7 - Math.floor(pos / 8),
        hp,
        maxHp: hp,
        attack:
          d.attack *
          scale *
          (has("狙击") ? 1.25 : 1) *
          (has("刺杀") ? 1.35 : 1),
        armor: d.armor + (has("装甲") ? 4 : 0),
        range: d.range,
        interval: Math.max(1, d.interval - (has("野兽") ? 1 : 0)),
        cooldown: 0,
        mana: has("熊猫") ? 100 : 0,
        damage: 0,
        flash: false,
      };
    });
}
export function simulate(left: Piece[], right: Piece[]): Battle {
  const fighters = [...army(left, 0), ...army(right, 1)];
  const regeneration = [left, right].map((p) =>
    synergies(p).some((s) => s.trait === "先锋" && s.active),
  );
  const frames: Battle["frames"] = [
    { tick: 0, fighters: structuredClone(fighters), events: [] },
  ];
  for (let tick = 1; tick <= RULES.maxTicks; tick++) {
    if (
      !fighters.some((f) => f.side === 0 && f.hp > 0) ||
      !fighters.some((f) => f.side === 1 && f.hp > 0)
    )
      break;
    const events: CombatEvent[] = [];
    // Alternate initiative each tick to avoid permanent left-side first-action priority.
    const order = tick % 2 ? [...fighters].reverse() : fighters;
    for (const f of order) {
      f.flash = false;
      if (f.hp <= 0) continue;
      if (regeneration[f.side] && UNIT[f.defId].traits.includes("先锋"))
        f.hp = Math.min(f.maxHp, f.hp + 8);
      const enemies = fighters
        .filter((e) => e.side !== f.side && e.hp > 0)
        .sort((a, b) => distance(f, a) - distance(f, b) || a.uid - b.uid);
      const target = enemies[0];
      if (!target) continue;
      if (f.cooldown > 0) {
        f.cooldown--;
        continue;
      }
      if (distance(f, target) > f.range) {
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
        const skill = f.mana >= 100;
        f.flash = skill;
        f.mana = skill ? 0 : Math.min(100, f.mana + 25);
        // Prototype unified skill: 2.2x hit; no claim of original skill implementation.
        const amount = Math.max(
          1,
          Math.round(
            (f.attack * (skill ? 2.2 : 1) * 100) / (100 + target.armor * 6),
          ),
        );
        events.push({
          attacker: f.uid,
          target: target.uid,
          amount: Math.min(target.hp, amount),
          skill,
          ranged: f.range > 1,
          from: { x: f.x, y: f.y },
          to: { x: target.x, y: target.y },
        });
        f.damage += Math.min(target.hp, amount);
        target.hp = Math.max(0, target.hp - amount);
        target.mana = Math.min(100, target.mana + 10);
        f.cooldown = f.interval - 1;
      }
    }
    frames.push({ tick, fighters: structuredClone(fighters), events });
  }
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
