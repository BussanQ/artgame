import { describe, expect, it } from "vitest";
import { SKILLS } from "../src/data/skills";
import { UNITS } from "../src/data/units";
import { army, simulate } from "../src/engine/battle";
import {
  castSkill,
  damage,
  heal,
  type CombatContext,
} from "../src/engine/abilities";
import type { Fighter, Piece } from "../src/engine/types";

function fighter(id: string, uid: number, side: 0 | 1, x = 3, y = 4): Fighter {
  const f = army(
    [{ uid, defId: id, star: 1, position: 35 }],
    side,
    "signature",
  )[0];
  Object.assign(f, { x, y, mana: 100 });
  return f;
}
function context(...fighters: Fighter[]): CombatContext {
  return { fighters, tick: 10, events: [], effects: [] };
}

describe("独立技能结算", () => {
  it("所有棋子都有独立技能配置，施法消耗能量且不会改动原始阵容", () => {
    expect(Object.keys(SKILLS).sort()).toEqual(UNITS.map((u) => u.id).sort());
    for (const u of UNITS) {
      const source = army(
          [{ uid: 1, defId: u.id, star: 1, position: 35 }],
          0,
        )[0],
        enemy = fighter("titan", 2, 1, 3, 3);
      if (["birdrider", "bladethrall", "staffthrall"].includes(u.id)) {
        expect(source.mana).toBe(0);
        expect(castSkill(context(source, enemy), source, enemy)).toBe(false);
        continue;
      }
      if (source.lightningChain || source.gospelAura) {
        expect(source.mana, u.id).toBe(0);
        expect(castSkill(context(source, enemy), source, enemy), u.id).toBe(false);
        continue;
      }
      source.hp -= 100;
      source.mana = 100;
      const ally = fighter("guard", 3, 0, 4, 4);
      ally.mana = 0;
      ally.hp -= 100;
      if (u.id === "skytoad") enemy.hp = 500;
      const ctx = context(source, enemy, ally);
      if (u.id === "blastbug") {
        expect(castSkill(ctx, source, enemy)).toBe(false);
        damage(ctx, enemy, source, 10000, "true");
        expect(source.deathBurst).toBe("spent");
        expect(ctx.effects.some((e) => e.kind === "cast")).toBe(true);
        continue;
      }
      expect(castSkill(ctx, source, enemy), u.id).toBe(true);
      expect(source.mana).toBe(0);
      expect(ctx.effects.some((e) => e.kind === "cast")).toBe(true);
      if (u.id === "spider") expect(enemy.side).toBe(source.side);
      else
        expect(
          ctx.events.length +
            ctx.effects.filter((e) => e.kind !== "cast").length +
            (source.air?.cast ||
            source.shuriken?.casting ||
            source.secretOrb?.casting || source.secretOrb?.channel ||
            source.bladeStorm ||
            source.sonic ||
            source.windup ||
            source.combo
              ? 1
              : 0),
          u.id,
        ).toBeGreaterThan(0);
      const after = structuredClone(ctx);
      expect(castSkill(ctx, source, enemy)).toBe(false);
      expect(ctx).toEqual(after);
    }
  });
  it("护盾先承伤，溢出扣生命，伤害统计只计实际生命伤害，治疗不复活", () => {
    const a = fighter("infantry", 1, 0),
      b = fighter("guard", 2, 1);
    b.shield = 50;
    b.hp = 100;
    const ctx = context(a, b);
    expect(damage(ctx, a, b, 80, "true")).toBe(30);
    expect(b.hp).toBe(70);
    expect(b.shield).toBe(0);
    expect(b.absorbed).toBe(50);
    expect(a.damage).toBe(30);
    heal(ctx, a, b, 10000);
    expect(b.hp).toBe(b.maxHp);
    expect(a.healing).toBe(b.maxHp - 70);
    damage(ctx, a, b, 10000, "true");
    expect(b.hp).toBe(0);
    heal(ctx, a, b, 10000);
    expect(b.hp).toBe(0);
    expect(ctx.events.reduce((n, e) => n + e.amount, 0)).toBe(a.damage);
  });
  it("物理受护甲影响，法术固定减伤，真实伤害绕过两种减伤", () => {
    const amounts = ["physical", "magic", "true"].map((type) => {
      const a = fighter("infantry", 1, 0),
        b = fighter("titan", 2, 1);
      b.armor = 100;
      return damage(
        context(a, b),
        a,
        b,
        100,
        type as "physical" | "magic" | "true",
      );
    });
    expect(amounts).toEqual([14, 80, 100]);
  });
  it("精准射击先破甲，盾击提供护盾与控制，怒吼只加速附近友军", () => {
    const a = fighter("infantry", 1, 0),
      b = fighter("titan", 2, 1, 3, 3),
      ctx = context(a, b);
    castSkill(ctx, a, b);
    expect(b.armorBreak).toBe(4);
    expect(b.armorBreakUntil).toBe(26);
    expect(ctx.events[0].amount).toBe(
      Math.round((a.attack * 2 * 100) / (100 + 6 * 6)),
    );
    const guard = fighter("guard", 3, 0),
      guardCtx = context(guard, b);
    castSkill(guardCtx, guard, b);
    expect(guard.shield).toBe(240);
    expect(guard.shieldUntil).toBe(30);
    expect(b.stunUntil).toBe(15);
    const lion = fighter("lion", 4, 0),
      near = fighter("guard", 5, 0, 3, 5),
      far = fighter("guard", 6, 0, 0, 7);
    castSkill(context(lion, near, far, b), lion, b);
    expect(lion.shield).toBe(190);
    expect(near.hasteUntil).toBe(26);
    expect(far.hasteUntil).toBe(0);
    expect(b.hasteUntil).toBe(0);
  });
  it("炮弹和冲击命中目标邻格，天坠范围更大且控制多个敌人", () => {
    for (const id of ["chariot", "pangolin", "titan"]) {
      const a = fighter(id, 1, 0),
        b = fighter("titan", 2, 1, 3, 3),
        near = fighter("guard", 3, 1, 4, 3),
        edge = fighter("guard", 4, 1, 5, 3),
        far = fighter("guard", 5, 1, 7, 0);
      const ctx = context(a, b, near, edge, far);
      castSkill(ctx, a, b);
      expect(ctx.events.map((e) => e.target)).toEqual(
        id === "titan" ? [2, 3, 4] : [2, 3],
      );
      if (id === "titan") expect(near.stunUntil).toBe(17);
      if (id === "pangolin") expect(near.armorBreak).toBe(4);
      expect(far.hp).toBe(far.maxHp);
    }
  });
  it("贯穿命中前方路径，排除身后及偏离射线目标；裁决削减能量", () => {
    for (const id of ["sniper", "cannon"]) {
      const a = fighter(id, 1, 0, 3, 6),
        target = fighter("titan", 2, 1, 3, 4),
        behind = fighter("guard", 3, 1, 3, 1),
        off = fighter("guard", 4, 1, 5, 3),
        back = fighter("guard", 5, 1, 3, 7);
      const ctx = context(a, target, behind, off, back);
      castSkill(ctx, a, target);
      expect(ctx.events.map((e) => e.target)).toEqual([2, 3]);
      expect(ctx.events.map((e) => e.primary)).toEqual([true, false]);
      if (id === "cannon") expect(behind.mana).toBe(70);
    }
  });
  it("治疗优先三个最伤的近处存活友军，实际治疗量可追踪", () => {
    const a = fighter("monk", 1, 0),
      enemy = fighter("titan", 2, 1, 3, 3);
    a.hp = 900;
    const allies = [
      fighter("guard", 3, 0, 2, 4),
      fighter("guard", 4, 0, 4, 4),
      fighter("guard", 5, 0, 3, 5),
      fighter("guard", 6, 0, 0, 0),
      fighter("guard", 7, 0, 2, 5),
    ];
    allies.forEach((f) => (f.hp = 100));
    allies[4].hp = 0;
    const ctx = context(a, enemy, ...allies);
    castSkill(ctx, a, enemy);
    expect(
      ctx.effects.filter((e) => e.kind === "heal").map((e) => e.target),
    ).toEqual([3, 4, 5]);
    expect(a.healing).toBe(825);
    expect(allies[3].hp).toBe(100);
    expect(allies[4].hp).toBe(0);
    expect(ctx.events).toHaveLength(0);
  });
  it("刺杀突袭最低生命比例目标，吸血按生命伤害计算，落点不重叠", () => {
    for (const id of ["panda", "wolf"]) {
      const a = fighter(id, 1, 0, 3, 6),
        front = fighter("guard", 2, 1, 3, 5),
        weak = fighter("titan", 3, 1, 6, 0);
      weak.hp = 600;
      a.hp = 200;
      const ctx = context(a, front, weak);
      castSkill(ctx, a, front);
      expect(ctx.events[0].target).toBe(3);
      expect(ctx.effects.some((e) => e.kind === "teleport")).toBe(true);
      expect(Math.abs(a.x - weak.x) + Math.abs(a.y - weak.y)).toBe(1);
      if (id === "wolf")
        expect(a.hp).toBe(200 + Math.round(ctx.events[0].amount * 0.6));
    }
  });
  it("无空位的突袭不会隔空攻击，也不消耗能量", () => {
    const a = fighter("wolf", 1, 0, 6, 6),
      target = fighter("titan", 2, 1, 0, 0);
    target.hp = 100;
    const ctx = context(
      a,
      target,
      fighter("guard", 3, 1, 0, 1),
      fighter("guard", 4, 1, 1, 0),
    );
    expect(castSkill(ctx, a, target)).toBe(false);
    expect(a.mana).toBe(100);
    expect(ctx.events).toHaveLength(0);
  });
  it("横扫击退只使用空格，不能越界或覆盖其他单位", () => {
    const a = fighter("master", 1, 0),
      target = fighter("titan", 2, 1, 3, 3),
      blocked = fighter("guard", 3, 1, 4, 4),
      wall = fighter("guard", 4, 0, 5, 4);
    const ctx = context(a, target, blocked, wall);
    castSkill(ctx, a, target);
    expect([target.x, target.y]).toEqual([3, 2]);
    expect([blocked.x, blocked.y]).toEqual([4, 4]);
    expect(ctx.events.map((e) => e.target)).toEqual([2, 3]);
  });
  it("完整回放确定、状态不泄漏到持久阵容、控制期间无法攻击、统计与事件相符", () => {
    const left: Piece[] = [
      { uid: 1, defId: "panda", star: 2, position: 35 },
      { uid: 2, defId: "monk", star: 2, position: 36 },
      { uid: 3, defId: "master", star: 2, position: 43 },
      { uid: 4, defId: "cannon", star: 1, position: 59 },
    ];
    const right: Piece[] = [
      { uid: 5, defId: "titan", star: 2, position: 35 },
      { uid: 6, defId: "guard", star: 2, position: 36 },
      { uid: 7, defId: "lion", star: 2, position: 43 },
      { uid: 8, defId: "chariot", star: 2, position: 59 },
    ];
    const original = structuredClone([left, right]),
      b = simulate(left, right);
    expect(b).toEqual(simulate(left, right));
    expect([left, right]).toEqual(original);
    const events = b.frames.flatMap((f) => f.events),
      effects = b.frames.flatMap((f) => f.effects);
    expect(effects.some((e) => e.kind === "stun")).toBe(true);
    for (const frame of b.frames) {
      const alive = frame.fighters.filter((f) => f.hp > 0);
      expect(new Set(alive.map((f) => `${f.x},${f.y}`)).size).toBe(
        alive.length,
      );
      for (const f of frame.fighters) {
        expect(f.hp).toBeGreaterThanOrEqual(0);
        expect(f.hp).toBeLessThanOrEqual(f.maxHp);
        expect(f.shield).toBeGreaterThanOrEqual(0);
        if (f.shieldUntil <= frame.tick) expect(f.shield).toBe(0);
        if (f.armorBreakUntil <= frame.tick) expect(f.armorBreak).toBe(0);
      }
      if (frame.tick > 0)
        for (const f of b.frames[frame.tick - 1].fighters.filter(
          (f) => f.stunUntil > frame.tick,
        )) {
          expect(frame.events.some((e) => e.attacker === f.uid && !e.periodic && !e.reflected)).toBe(false);
          expect(
            frame.effects.some((e) => e.kind === "cast" && e.source === f.uid),
          ).toBe(false);
        }
    }
    for (const f of b.frames.at(-1)!.fighters) {
      expect(f.damage).toBe(
        events
          .filter((e) => e.attacker === f.uid)
          .reduce((n, e) => n + e.amount, 0),
      );
      expect(f.absorbed).toBe(
        events
          .filter((e) => e.target === f.uid)
          .reduce((n, e) => n + e.absorbed, 0),
      );
      const activeHealing = effects
        .filter((e) => e.source === f.uid && e.kind === "heal")
        .reduce((n, e) => n + e.amount, 0);
      // Health conservation observes self-regeneration independently of the regen rate.
      const regeneration = f.armorRegen || f.innateRegen
        ? b.frames.slice(1).reduce((total, frame, index) => {
            const previous = b.frames[index].fighters.find(
              (unit) => unit.uid === f.uid,
            );
            const current = frame.fighters.find((unit) => unit.uid === f.uid);
            if (!previous || !current || previous.hp <= 0) return total;
            const received = frame.events
              .filter((event) => event.target === f.uid)
              .reduce((n, event) => n + event.amount, 0);
            const healed = frame.effects
              .filter(
                (effect) => effect.kind === "heal" && effect.target === f.uid,
              )
              .reduce((n, effect) => n + effect.amount, 0);
            return total + current.hp - previous.hp + received - healed;
          }, 0)
        : 0;
      expect(f.healing).toBeCloseTo(activeHealing + regeneration, 8);
    }
  });
});
