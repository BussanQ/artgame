import { describe, it, expect } from "vitest";
import { deployLineup } from "../src/engine/ai";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { damage, castSkill, type CombatContext } from "../src/engine/abilities";
import { synergies } from "../src/engine/synergies";
import { callWolfPack, callRetinue } from "../src/engine/summons";
import { analyzeBattle } from "../src/engine/battle-analysis";
import {
  createGame,
  buy,
  startRound,
  settle,
  resumeRound,
} from "../src/engine/game";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { compute } from "../src/compute/job";
import { PSYCHIC_ADDITIONS, COPIES, UNIT } from "../src/data/units";
import type { Piece, Fighter } from "../src/engine/types";
const p = (
  id: string,
  uid: number,
  pos: number | null = 35,
  star = 1,
): Piece => ({ uid, defId: id, position: pos, star });
const f = (id: string, uid: number, side: 0 | 1 = 0) =>
  army([p(id, uid)], side)[0];
const ctx = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 10,
  events: [],
  effects: [],
});
const core = () => [
  p("acolyte", 1, 43),
  p("adept", 2, 51),
  p("stormcaller", 3, 44),
  p("thunderlord", 4, 52),
];
describe("灵能反伤与能量体系", () => {
  it("2/4种为全队提供20/30反伤，同名备战不计，旧版本不启用", () => {
    expect(
      army([...core(), p("guard", 5, 35)], 0).map((x) => x.reflection),
    ).toEqual([30, 30, 30, 30, 30]);
    const two = [p("adept", 1), p("acolyte", 2, 43), p("stormcaller", 3, null)];
    expect(synergies(two).find((s) => s.trait === "灵能")).toMatchObject({
      count: 2,
      tier: 1,
    });
    expect(army(two, 0)[0].reflection).toBe(20);
    expect(
      army([p("adept", 1), p("adept", 2, 36)], 0)[0].reflection,
    ).toBeUndefined();
    expect(
      army(core(), 0, "airsea").every((x) => x.reflection === undefined),
    ).toBe(true);
  });
  it("护盾受击也反伤，双方反伤不递归、不吸血、不产生回能", () => {
    const a = f("guard", 10, 1),
      b = f("adept", 11);
    a.reflection = b.reflection = 30;
    a.mana = 12;
    b.mana = 20;
    a.hp = 400;
    a.lifesteal = 1;
    b.shield = 200;
    b.hp = 400;
    b.lifesteal = 1;
    const c = ctx(a, b);
    damage(c, a, b, 100, "true");
    expect(b.hp).toBe(400);
    expect(b.shield).toBe(100);
    expect(b.mana).toBe(30);
    expect(a.hp).toBe(370);
    expect(a.mana).toBe(12);
    expect(c.events.map((e) => [e.amount, !!e.reflected])).toEqual([
      [0, false],
      [30, true],
    ]);
    expect(b.damage).toBe(30);
    expect(a.damage).toBe(0);
  });
  it("致命受击仍反伤；残魂反伤不受免伤跳过，残魂之间不循环", () => {
    const [v, b] = army(
      [
        p("vine", 1),
        p("bonedragon", 2, 43),
        ...core().map((x) => ({
          ...x,
          uid: x.uid + 10,
          position: x.position! + 8,
        })),
      ],
      0,
    );
    const e = f("guard", 99, 1);
    e.reflection = 30;
    const c = ctx(v, b, e);
    v.hp = 1;
    v.shield = 0;
    damage(c, e, v, 100, "true");
    expect(v.immortal?.spent).toBe(true);
    expect(e.hp).toBe(e.maxHp - 30);
    const before = e.hp;
    damage(c, e, v, 100, "true");
    expect(v.hp).toBe(1);
    expect(e.hp).toBe(before - 30);
    e.immortal = { spent: true, duration: 16, until: 26 };
    e.hp = 1;
    const n = c.events.length;
    damage(c, e, v, 100, "true");
    expect(c.events.length - n).toBe(2);
    expect(e.hp).toBe(1);
    const dead = f("acolyte", 100);
    dead.reflection = 20;
    dead.hp = 1;
    dead.shield = 0;
    const q = f("guard", 101, 1);
    damage(ctx(dead, q), q, dead, 10, "true");
    expect(dead.hp).toBe(0);
    expect(q.hp).toBe(q.maxHp - 20);
  });
  it("闪避不触发反伤，反伤可触发对方死亡爆炸但不能互相反弹", () => {
    const a = f("guard", 1),
      b = f("repair", 2, 1);
    b.air!.evasion = 1;
    b.reflection = 30;
    const c = ctx(a, b);
    damage(c, a, b, 50);
    expect(a.hp).toBe(a.maxHp);
    expect(c.effects.length).toBe(0);
    const bug = f("blastbug", 4, 1),
      g = f("guard", 5);
    g.reflection = 30;
    bug.hp = 1;
    bug.x = g.x;
    bug.y = g.y + 1;
    const d = ctx(bug, g);
    damage(d, bug, g, 10, "true");
    expect(bug.deathBurst).toBe("spent");
    expect(d.events.filter((e) => e.reflected)).toHaveLength(1);
    expect(g.hp).toBeLessThan(g.maxHp - 10);
  });
  it("幼狼与两类傀儡继承团队反伤，不进入持久阵容", () => {
    for (const id of ["wolf", "adept", "shark"]) {
      const pieces = [
        p(id, 10),
        p("acolyte", 11, 43),
        p("stormcaller", 12, 44),
      ];
      const units = army(pieces, 0),
        s = units[0];
      s.mana = 100;
      const c = ctx(...units);
      expect(id === "wolf" ? callWolfPack(c, s) : callRetinue(c, s)).toBe(true);
      const pets = c.fighters.filter((f) => f.summon);
      expect(pets.length).toBeGreaterThan(0);
      expect(pets.every((f) => f.reflection === 20)).toBe(true);
      expect(pieces).toHaveLength(3);
    }
  });
  it("童子优先充能最高攻击的两个合格友军，受封能压制且上限100", () => {
    const a = f("acolyte", 1),
      g = f("guard", 2),
      b = f("bonedragon", 3),
      t = f("thunderlord", 4),
      other = f("acolyte", 5),
      enemy = f("guard", 9, 1);
    for (const x of [g, b, t, other]) {
      x.x = a.x;
      x.y = a.y + 1;
      x.mana = 60;
    }
    b.attack = 100;
    t.attack = 200;
    g.attack = 90;
    b.energyMultiplier = 0.75;
    t.mana = 90;
    a.mana = 100;
    const c = ctx(a, g, b, t, other, enemy);
    expect(castSkill(c, a, enemy)).toBe(true);
    expect(t.mana).toBe(100);
    expect(b.mana).toBe(78.75);
    expect(g.mana).toBe(60);
    expect(other.mana).toBe(60);
    expect(a.mana).toBe(0);
    expect(
      c.effects.filter((e) => e.kind === "energize").map((e) => e.amount),
    ).toEqual([10, 18.75]);
    t.manaLockUntil = 20;
    b.manaLockUntil = 20;
    g.manaLockUntil = 20;
    a.mana = 100;
    expect(castSkill(c, a, enemy)).toBe(false);
    expect(a.mana).toBe(100);
  });
  it("童子跳过召唤物、被动兵种和三格外友军，不存在童子互充循环", () => {
    const a = f("acolyte", 1),
      w = f("wolf", 2),
      cav = f("cavalry", 3),
      d = f("acolyte", 4),
      far = f("guard", 5),
      e = f("guard", 9, 1);
    w.summon = { owner: 1, born: 0 };
    far.x = 7;
    far.y = 0;
    const c = ctx(a, w, cav, d, far, e);
    a.mana = 100;
    expect(castSkill(c, a, e)).toBe(false);
  });
  it("天师法球只命中目标两格内敌人", () => {
    const s = f("stormcaller", 1),
      a = f("guard", 2, 1),
      b = f("guard", 3, 1),
      c = f("guard", 4, 1),
      ally = f("guard", 5);
    a.x = 2;
    a.y = 2;
    b.x = 4;
    b.y = 2;
    c.x = 5;
    c.y = 2;
    ally.x = 2;
    ally.y = 2;
    s.mana = 100;
    const battle = ctx(s, a, b, c, ally);
    castSkill(battle, s, a);
    expect(battle.events.map((e) => e.target)).toEqual([2, 3]);
    expect(c.hp).toBe(c.maxHp);
    expect(ally.hp).toBe(ally.maxHp);
  });
  it("连锁最多四个不同目标，距离与UID决定跳跃，倍率衰减", () => {
    const s = f("thunderlord", 1);
    s.mana = 100;
    const es = [2, 3, 4, 5, 6].map((id) => f("guard", id, 1));
    es.forEach((x, i) => {
      x.x = i + 1;
      x.y = 2;
      x.shield = 0;
      x.magicResist = 0;
    });
    const c = ctx(s, ...es);
    castSkill(c, s, es[0]);
    expect(c.events.map((e) => e.target)).toEqual([2, 3, 4, 5]);
    expect(c.events.map((e) => e.amount)).toEqual([240, 192, 154, 123]);
    expect(
      c.effects.filter((e) => e.kind === "chain").map((e) => e.source),
    ).toEqual([1, 2, 3, 4]);
  });
  it("完整、快速与Worker协议结果一致，反伤统计守恒，状态不修改输入", () => {
    const left = [
      ...core(),
      p("vine", 5, 35),
      p("bonedragon", 6, 36),
      p("treant", 7, 34),
    ];
    const right = [
      p("wolf", 21, 35, 2),
      p("panda", 22, 36, 2),
      p("lion", 23, 34, 2),
      p("cannon", 24, 44, 2),
    ];
    const original = structuredClone([left, right]),
      b = simulate(left, right),
      fast = simulateOutcome(left, right);
    expect([left, right]).toEqual(original);
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect(fast.winner).toBe(b.winner);
    expect(fast.damage).toBe(b.damage);
    const result = compute({ kind: "replay", left, right, version: "fleet" });
    expect(result.kind).toBe("replay");
    if (result.kind === "replay") expect(result.battle).toEqual(b);
    const report = analyzeBattle(b);
    expect(
      report.sides.flatMap((s) => s.fighters).some((f) => f.energyGiven > 0),
    ).toBe(true);

    expect(
      report.sides
        .flatMap((s) => s.fighters)
        .some((f) => f.reflectedDamage > 0),
    ).toBe(true);
    for (const row of report.sides.flatMap((s) => s.fighters)) {
      expect(row.damage).toBe(
        row.normalDamage + row.skillDamage + row.reflectedDamage,
      );
      expect(row.energyGiven).toBe(
        b.frames
          .flatMap((f) => f.effects)
          .filter((e) => e.kind === "energize" && e.source === row.uid)
          .reduce((n, e) => n + e.amount, 0),
      );
      expect(row.damage).toBe(
        b.frames.at(-1)!.fighters.find((f) => f.uid === row.uid)!.damage,
      );
    }
    for (const frame of b.frames) {
      const live = frame.fighters.filter((f) => f.hp > 0);
      expect(new Set(live.map((f) => f.x + ":" + f.y)).size).toBe(live.length);
    }
  });
});
describe("充能辅助选阵", () => {
  it("有施法主力时选择童子，无能量技能队伍优先直接输出", () => {
    for (const [ids, expected] of [
      [["thunderlord", "titan", "stormcaller"], "acolyte"],
      [["cavalry", "turtle", "tiger"], "infantry"],
    ] as const) {
      const game = createGame(42),
        me = game.players[0];
      me.level = 4;
      me.pieces = [
        ...ids.map((id, i) => p(id, i + 1, null, 2)),
        p("acolyte", 4, null),
        p("infantry", 5, null),
      ];
      const before = structuredClone(me.pieces);
      deployLineup(me, "standard");
      expect(
        me.pieces.filter((p) => p.position !== null).map((p) => p.defId),
      ).toContain(expected);
      expect(me.pieces.map((p) => ({ ...p, position: null }))).toEqual(before);
    }
  });
});
describe("0.13存档增量兼容", () => {
  for (const phase of ["prepare", "battle", "result", "finished"] as const)
    it(phase + "只补新卡池并保留回放", () => {
      const g = createGame(137);
      for (const player of g.players)
        for (let i = 0; i < player.shop.length; i++)
          if (PSYCHIC_ADDITIONS.includes(player.shop[i] ?? ""))
            player.shop[i] = null;
      for (const id of PSYCHIC_ADDITIONS) g.pool[id] = 0;
      let result: ReturnType<typeof startRound> | undefined;
      if (phase !== "prepare") {
        const me = g.players[0];
        if (me.shop[0]) g.pool[me.shop[0]]++;
        me.shop[0] = "fish";
        g.pool.fish--;
        expect(buy(g, me, 0)).toBe(true);
        me.pieces[0].position = 35;
        if (phase === "finished") me.hp = 1;
        result = startRound(g);
        if (phase === "result" || phase === "finished") settle(g, result!);
      }
      expect(g.phase).toBe(phase);
      const before = structuredClone(g);
      for (const id of PSYCHIC_ADDITIONS) delete g.pool[id];
      const raw = JSON.stringify({
        schema: 12,
        rules: "singleplayer-0.13",
        savedAt: 1,
        revision: 1,
        game: g,
        playback: { time: 0, speed: 1, paused: false },
      });
      const decoded = decodeSave(raw);
      expect(decoded.status).toBe("migrated");
      expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
      const after = decoded.data!.game;
      expect(validGame(after)).toBe(true);
      expect(after.players).toEqual(before.players);
      expect(after.history).toEqual(before.history);
      expect(after.combatVersion).toBe(before.combatVersion);
      for (const id of PSYCHIC_ADDITIONS)
        expect(after.pool[id]).toBe(COPIES[UNIT[id].cost]);
      if (phase === "battle")
        expect(resumeRound(after)!.battle).toEqual(result!.battle);
    });
});
