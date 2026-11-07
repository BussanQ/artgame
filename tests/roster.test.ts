import { describe, it, expect } from "vitest";
import {
  UNITS,
  UNIT,
  ROSTER_ADDITIONS,
  COPIES,
  RULES,
} from "../src/data/units";
import { army, simulate } from "../src/engine/battle";
import {
  castSkill,
  damage,
  gainMana,
  distance,
  type CombatContext,
} from "../src/engine/abilities";
import { createGame, buy, move, resumeRound, settle } from "../src/engine/game";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import type { Fighter, Piece } from "../src/engine/types";

const piece = (id: string, uid: number, position = 35): Piece => ({
  uid,
  defId: id,
  position,
  star: 1,
});
function fighter(id: string, uid: number, side: 0 | 1, x = 3, y = 4): Fighter {
  const f = army([piece(id, uid)], side, "balanced")[0];
  Object.assign(f, { x, y, mana: 100 });
  return f;
}
const ctx = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 10,
  events: [],
  effects: [],
});
describe("扩展兵种与存档", () => {
  it("骑兵与牛魔冲锋有合法落点；全包围时不花能量穿模", () => {
    for (const id of ["cavalry", "bull"]) {
      const a = fighter(id, 1, 0, 0, 7),
        b = fighter("titan", 2, 1, 4, 1),
        c = ctx(a, b);
      expect(castSkill(c, a, b)).toBe(true);
      expect(distance(a, b)).toBe(1);
      expect(b.stunUntil).toBeGreaterThan(c.tick);
      expect(new Set(c.fighters.map((f) => `${f.x},${f.y}`)).size).toBe(2);
      const blocked = fighter(id, 3, 0, 0, 7);
      const blockers = [
        [4, 0],
        [5, 1],
        [4, 2],
        [3, 1],
      ].map(([x, y], i) => fighter("guard", 10 + i, 1, x, y));
      const full = ctx(blocked, b, ...blockers),
        before = structuredClone(full);
      expect(castSkill(full, blocked, b)).toBe(false);
      expect(full).toEqual(before);
    }
  });
  it("暗影刀选择最远目标并造成近身范围伤害，不命中远处友军", () => {
    const a = fighter("shadowblade", 1, 0, 3, 6),
      near = fighter("guard", 2, 1, 3, 5),
      far = fighter("titan", 3, 1, 3, 0),
      ally = fighter("guard", 4, 0, 0, 7);
    const c = ctx(a, near, far, ally);
    castSkill(c, a, near);
    expect(distance(a, far)).toBe(1);
    expect(far.hp).toBeLessThan(far.maxHp);
    expect(near.hp).toBe(near.maxHp);
    expect(ally.hp).toBe(ally.maxHp);
    expect(a.shield).toBe(Math.round(a.maxHp * 0.25));
  });
  it("幻歌清空并封锁能量，普通攻击仍造成伤害，满 2 秒恢复能量获取", () => {
    const a = fighter("dragonfly", 1, 0),
      b = fighter("infantry", 2, 1, 3, 3),
      c = ctx(a, b);
    castSkill(c, a, b);
    expect(b.mana).toBe(0);
    expect(b.manaLockUntil).toBe(18);
    gainMana(b, 25, 17);
    damage(c, a, b, 10);
    expect(b.mana).toBe(0);
    const hp = a.hp;
    damage(c, b, a, 30);
    expect(a.hp).toBeLessThan(hp);
    gainMana(b, 25, 18);
    expect(b.mana).toBe(25);
  });
  it("灵鱼驱散范围内负面状态并治疗，不复活、不越范围、不移除增益", () => {
    const a = fighter("fish", 1, 0),
      b = fighter("guard", 2, 0, 3, 3),
      far = fighter("guard", 3, 0, 0, 0),
      dead = fighter("guard", 4, 0, 4, 4),
      enemy = fighter("titan", 5, 1, 3, 2);
    for (const f of [b, far, dead])
      Object.assign(f, {
        hp: f.hp - 200,
        stunUntil: 20,
        armorBreak: 4,
        armorBreakUntil: 26,
        manaLockUntil: 18,
        armorBuff: 6,
        armorBuffUntil: 30,
      });
    dead.hp = 0;
    const farBefore = structuredClone(far);
    castSkill(ctx(a, b, far, dead, enemy), a, enemy);
    expect(b.stunUntil + b.armorBreakUntil + b.manaLockUntil).toBe(0);
    expect(b.hp).toBe(b.maxHp - 200 + 54);
    expect(b.armorBuff).toBe(6);
    expect(far).toEqual(farBefore);
    expect(dead.hp).toBe(0);
  });
  it("玄甲只在期限内减物伤；鹿保护最低生命两人且不缩短已有护盾", () => {
    const turtle = fighter("turtle", 1, 0),
      enemy = fighter("infantry", 2, 1, 3, 3),
      c = ctx(turtle, enemy);
    castSkill(c, turtle, enemy);
    const armored = damage(c, enemy, turtle, 100);
    c.tick = 34;
    expect(damage(c, enemy, turtle, 100)).toBeGreaterThan(armored);
    const deer = fighter("deer", 3, 0),
      a = fighter("guard", 4, 0, 2, 4),
      b = fighter("guard", 5, 0, 3, 5),
      healthy = fighter("guard", 6, 0, 4, 4);
    a.hp = 100;
    b.hp = 200;
    a.shield = 600;
    a.shieldUntil = 161;
    castSkill(ctx(deer, a, b, healthy, enemy), deer, enemy);
    expect(a.armorBuff).toBe(6);
    expect(b.armorBuff).toBe(6);
    expect(healthy.armorBuff).toBe(0);
    expect(a.shield).toBe(600);
    expect(a.shieldUntil).toBe(161);
    expect(b.shield).toBe(163);
    expect(b.hp).toBe(298);
    expect(deer.healing).toBe(196);
  });
  it("箭雨限制在目标周围两格并无视部分护甲", () => {
    const tiger = fighter("tiger", 1, 0),
      center = fighter("titan", 2, 1, 3, 2),
      near = fighter("guard", 3, 1, 4, 3),
      far = fighter("guard", 4, 1, 0, 0),
      ally = fighter("guard", 5, 0, 3, 3);
    const c = ctx(tiger, center, near, far, ally);
    castSkill(c, tiger, center);
    expect(center.maxHp - center.hp).toBe(
      Math.round((tiger.attack * 1.8 * 100) / (100 + 10 * 0.7 * 6)),
    );
    expect(near.hp).toBeLessThan(near.maxHp);
    expect(far.hp).toBe(far.maxHp);
    expect(ally.hp).toBe(ally.maxHp);
    expect(c.events.filter((e) => e.primary)).toHaveLength(1);
  });
  it("支援阵亡回复只触发一次，回复上限及能量封锁生效，备战不计羁绊", () => {
    const friends = army(
        [piece("fish", 1), piece("deer", 2, 36), piece("guard", 3, 37)],
        0,
      ),
      enemy = fighter("titan", 9, 1),
      [fish, deer, guard] = friends;
    deer.hp -= 300;
    guard.hp -= 50;
    deer.mana = 0;
    guard.mana = 0;
    guard.manaLockUntil = 20;
    const c = ctx(...friends, enemy);
    damage(c, enemy, fish, 10000, "true");
    expect(fish.hp).toBe(0);
    expect(fish.healing).toBe(250);
    expect(deer.hp).toBe(deer.maxHp - 100);
    expect(deer.mana).toBe(10);
    expect(guard.mana).toBe(0);
    const after = structuredClone(c);
    damage(c, enemy, fish, 10000, "true");
    expect(c).toEqual(after);
    const reserve = army(
      [piece("fish", 1), { ...piece("deer", 2), position: null }],
      0,
    );
    expect(reserve[0].supportHeal).toBe(0);
    const full = army(
      [
        piece("fish", 1),
        piece("deer", 2, 36),
        piece("dragonfly", 3, 37),
        piece("repair", 4, 38),
      ],
      0,
    );
    expect(
      full.every((f) => f.supportHeal === 500 && f.supportMana === 20),
    ).toBe(true);
  });
  it("20 兵种混战可重放且落点唯一，有限护甲和能量状态如期结束", () => {
    const left = UNITS.slice(0, 10).map((u, i) => piece(u.id, i + 1, 32 + i)),
      right = UNITS.slice(10, 20).map((u, i) => piece(u.id, 20 + i, 32 + i));
    const copy = structuredClone([left, right]),
      battle = simulate(left, right);
    expect(simulate(left, right)).toEqual(battle);
    expect([left, right]).toEqual(copy);
    for (const frame of battle.frames) {
      const live = frame.fighters.filter((f) => f.hp > 0);
      expect(new Set(live.map((f) => `${f.x},${f.y}`)).size).toBe(live.length);
      for (const f of frame.fighters) {
        expect(f.mana).toBeGreaterThanOrEqual(0);
        expect(f.mana).toBeLessThanOrEqual(100);
        expect(f.hp).toBeGreaterThanOrEqual(0);
        if (f.armorBuffUntil <= frame.tick) expect(f.armorBuff).toBe(0);
      }
    }
  });
  it.each(["prepare", "battle", "result"] as const)(
    "schema 3 的 %s 存档只补新卡池，不重抽商店或改旧战斗",
    (phase) => {
      const old = createGame(17, "classic");
      for (const p of old.players)
        p.shop = p.shop.map((id) => {
          if (id && ROSTER_ADDITIONS.includes(id)) {
            old.pool[id]++;
            return null;
          }
          return id;
        });
      for (const id of ROSTER_ADDITIONS) delete old.pool[id];
      const p = old.players[0];
      if (p.shop[0]) old.pool[p.shop[0]]++;
      old.pool.guard--;
      p.shop[0] = "guard";
      buy(old, p, 0);
      move(old, p, p.pieces[0].uid, 35);
      if (phase !== "prepare") old.phase = "battle";
      const oldBattle = phase !== "prepare" ? resumeRound(old) : null;
      if (phase === "result") settle(old, oldBattle!);
      const before = structuredClone(old);
      const decoded = decodeSave(
        JSON.stringify({
          schema: 3,
          rules: "singleplayer-0.4",
          savedAt: 1,
          revision: 3,
          game: old,
          playback: { time: 0, speed: 2, paused: true },
        }),
      );
      expect(decoded.status).toBe("migrated");
      expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
      expect(decoded.data!.rules).toBe(RULES.version);
      const restored = decoded.data!.game;
      expect(validGame(restored)).toBe(true);
      for (const id of ROSTER_ADDITIONS)
        expect(restored.pool[id]).toBe(COPIES[UNIT[id].cost]);
      expect({ ...restored, pool: before.pool }).toEqual(before);
      if (phase === "battle")
        expect(resumeRound(restored)!.battle).toEqual(oldBattle!.battle);
    },
  );
});
