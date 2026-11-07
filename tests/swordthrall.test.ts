import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  damage,
  gainMana,
  type CombatContext,
} from "../src/engine/abilities";
import { advanceBladeStorm, bladeStormActive } from "../src/engine/swordthrall";
import { silence } from "../src/engine/infantry-skills";
import { callRetinue } from "../src/engine/summons";
import { skillReady } from "../src/engine/triggers";
import {
  createGame,
  buy,
  buyXp,
  roll,
  sell,
  move,
  startRound,
  settle,
  resumeRound,
} from "../src/engine/game";
import { prepareBot } from "../src/engine/ai";
import { isRecruitable, type Series } from "../src/engine/rotation";
import { validGame, decodeSave, SAVE_SCHEMA } from "../src/engine/persistence";
import { COPIES, RULES, UNIT } from "../src/data/units";
import { BLADE_STORM } from "../src/data/skills";
import { SWORDTHRALL_DEMO } from "../src/data/swordthrall-demo";
import { compute } from "../src/compute/job";
import type { Fighter, Game, Piece } from "../src/engine/types";
import frozen from "./fixtures/pre-v033-replays.json";

const p = (
  defId: string,
  uid: number,
  star = 1,
  position: number | null = 35,
): Piece => ({ defId, uid, star, position });
const f = (id: string, uid: number, side: 0 | 1, star = 1) =>
  Object.assign(army([p(id, uid, star)], side)[0], {
    x: 3,
    y: side ? 2 : 3,
    mana: 100,
    shield: 0,
    magicResist: 0,
  });
const context = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 10,
  effects: [],
  events: [],
});
const setup = (star = 1) => {
  const sword = f("swordthrall", 1, 0, star),
    target = f("turtle", 2, 1, 3);
  return { sword, target, ctx: context(sword, target) };
};
const save = (g: Game, schema = SAVE_SCHEMA, rules = RULES.version) =>
  JSON.stringify({
    schema,
    rules,
    savedAt: 1,
    revision: 1,
    game: g,
    playback: { time: 2, speed: 2, paused: true },
  });
function clearShops(g: Game) {
  for (const q of g.players) {
    for (const id of q.shop) if (id) g.pool[id]++;
    q.shop = [null, null, null, null, null];
  }
}

describe("剑奴狂舞花绽", () => {
  it("二费傀儡先锋、基础属性和初始能量", () => {
    expect(UNIT.swordthrall).toMatchObject({
      cost: 2,
      traits: ["傀儡", "先锋"],
      hp: 600,
      attack: 79,
      armor: 5,
      interval: 5,
      range: 1,
      initialMana: 25,
    });
    expect(army([p("swordthrall", 1, 3)], 0)[0]).toMatchObject({
      maxHp: 2400,
      attack: 316,
      mana: 25,
    });
  });
  it.each([1, 2, 3])(
    "%i星6次伤害、1秒间隔、6.5秒保护与技能强度快照",
    (star) => {
      const { sword, target, ctx } = setup(star);
      sword.skillPower = 1.5;
      expect(castSkill(ctx, sword, target)).toBe(true);
      expect(sword.mana).toBe(0);
      expect(sword.skillReadyAt).toBe(58);
      sword.skillPower = 9;
      sword.attack = 9999;
      for (let tick = 11; tick < 36; tick++) {
        ctx.tick = tick;
        advanceBladeStorm(ctx, sword);
      }
      expect(ctx.events).toHaveLength(6);
      expect(
        ctx.events.every(
          (e) => e.skill && e.amount === BLADE_STORM.damage[star - 1] * 1.5,
        ),
      ).toBe(true);
      expect(sword.bladeStorm?.remaining).toBe(0);
      expect(bladeStormActive(sword, 35)).toBe(true);
      expect(sword.signature?.casts).toBe(1);
      ctx.tick = 36;
      expect(advanceBladeStorm(ctx, sword)).toBe(false);
      expect(sword.bladeStorm).toBeUndefined();
      expect(ctx.events).toHaveLength(6);
    },
  );
  it("圆形范围随位置变化，包含对角、隐蔽、空中敌人；排除友军和范围外目标", () => {
    const { sword, target, ctx } = setup();
    const diagonal = f("ghostjet", 3, 1, 3),
      far = f("turtle", 4, 1, 3),
      friend = f("guard", 5, 0, 3);
    Object.assign(diagonal, { x: 4, y: 4 });
    diagonal.air!.phaseUntil = 100;
    Object.assign(far, { x: 5, y: 3 });
    Object.assign(friend, { x: 4, y: 3 });
    ctx.fighters.push(diagonal, far, friend);
    castSkill(ctx, sword, target);
    ctx.tick = 14;
    advanceBladeStorm(ctx, sword);
    expect(ctx.events.map((e) => e.target).sort()).toEqual([2, 3]);
    sword.x = 5;
    sword.y = 4;
    ctx.events = [];
    ctx.tick = 18;
    advanceBladeStorm(ctx, sword);
    expect(ctx.events.map((e) => e.target).sort()).toEqual([3, 4]);
    ctx.fighters = [sword, friend];
    ctx.events = [];
    ctx.tick = 22;
    advanceBladeStorm(ctx, sword);
    expect(ctx.events).toHaveLength(0);
    expect(sword.bladeStorm!.remaining).toBe(3);
  });
  it.each(["physical", "magic", "true"] as const)(
    "免疫%s技能伤害但仍承受普通攻击，免疫不消耗护盾",
    (type) => {
      const { sword, target, ctx } = setup();
      castSkill(ctx, sword, target);
      sword.shield = 100;
      sword.shieldUntil = 100;
      const hp = sword.hp;
      damage(ctx, target, sword, 150, type, true);
      expect(sword.hp).toBe(hp);
      expect(sword.shield).toBe(100);
      expect(ctx.events.at(-1)).toMatchObject({
        amount: 0,
        absorbed: 0,
        immune: true,
      });
      damage(ctx, target, sword, 150, "true", false);
      expect(sword.hp).toBe(hp - 50);
      expect(sword.shield).toBe(0);
      ctx.tick = 36;
      damage(ctx, target, sword, 100, "true", true);
      expect(sword.hp).toBe(hp - 150);
    },
  );
  it.each(["stun", "silence", "slow", "charm", "knockback", "sentinel"])(
    "旋转时免疫%s，过期后相同控制恢复有效",
    (kind) => {
      const { sword, target, ctx } = setup();
      castSkill(ctx, sword, target);
      const apply = () => {
        const enemy = f(
          {
            stun: "axethrall",
            silence: "grenadier",
            slow: "vajra",
            charm: "spider",
            knockback: "master",
            sentinel: "shark",
          }[kind]!,
          10,
          1,
          2,
        );
        if (kind === "sentinel") enemy.x = 2;
        ctx.fighters.push(enemy);
        if (kind === "silence") silence(ctx, enemy, sword, 8);
        else if (kind === "sentinel") {
          expect(callRetinue(ctx, enemy)).toBe(true);
          expect(
            ctx.fighters.some(
              (f) =>
                f.summon?.owner === enemy.uid &&
                Math.abs(f.x - sword.x) + Math.abs(f.y - sword.y) <= 1,
            ),
          ).toBe(true);
        } else castSkill(ctx, enemy, sword);
        return enemy;
      };
      const pos = [sword.x, sword.y],
        first = apply();
      expect(sword.stunUntil).toBe(0);
      expect(sword.silenceUntil ?? 0).toBe(0);
      expect(sword.slow).toBeUndefined();
      expect(sword.charm).toBeUndefined();
      expect([sword.x, sword.y]).toEqual(pos);
      if (kind === "charm") expect(first.charmCast).toBe("ready");
      ctx.fighters = [sword];
      ctx.tick = 36;
      advanceBladeStorm(ctx, sword);
      apply();
      if (kind === "stun" || kind === "sentinel")
        expect(sword.stunUntil).toBeGreaterThan(36);
      if (kind === "silence") expect(sword.silenceUntil).toBe(44);
      if (kind === "slow") expect(sword.slow).toBeDefined();
      if (kind === "charm") expect(sword.charm).toBeDefined();
      if (kind === "knockback") expect([sword.x, sword.y]).not.toEqual(pos);
    },
  );
  it.each([
    "mana",
    "cooldown",
    "stun",
    "silence",
    "charm",
    "dead",
    "far",
    "concealed",
  ])("%s阻止启动，不消耗能量", (reason) => {
    const { sword, target, ctx } = setup();
    if (reason === "mana") sword.mana = 99;
    if (reason === "cooldown") sword.skillReadyAt = 11;
    if (reason === "stun") sword.stunUntil = 11;
    if (reason === "silence") sword.silenceUntil = 11;
    if (reason === "charm")
      sword.charm = { until: 20, side: 0, attack: sword.attack };
    if (reason === "dead") sword.hp = 0;
    if (reason === "far") target.x = 6;
    if (reason === "concealed") target.air!.phaseUntil = 100;
    const before = structuredClone(ctx);
    expect(castSkill(ctx, sword, target)).toBe(false);
    expect(ctx).toEqual(before);
  });
  it("旋转不回能、不重复启动；死亡后无脉冲或保护，12秒冷却边界正确", () => {
    const a = setup();
    castSkill(a.ctx, a.sword, a.target);
    gainMana(a.sword, 100, 11);
    expect(a.sword.mana).toBe(0);
    expect(skillReady(a.sword)).toBe(false);
    a.ctx.tick = 36;
    advanceBladeStorm(a.ctx, a.sword);
    gainMana(a.sword, 100, 36);
    a.ctx.tick = 57;
    expect(castSkill(a.ctx, a.sword, a.target)).toBe(false);
    a.ctx.tick = 58;
    expect(castSkill(a.ctx, a.sword, a.target)).toBe(true);
    damage(a.ctx, a.target, a.sword, 10000, "true", false);
    expect(a.sword.hp).toBe(0);
    expect(a.sword.bladeStorm).toBeUndefined();
    a.ctx.tick = 62;
    const count = a.ctx.events.length;
    expect(advanceBladeStorm(a.ctx, a.sword)).toBe(false);
    expect(a.ctx.events).toHaveLength(count);
  });
  it("持续脉冲不会吸血，不受普攻减速或强化影响；反伤是技能伤害被免疫", () => {
    const { sword, target, ctx } = setup(2);
    sword.hp = 100;
    sword.lifesteal = 1;
    target.reflection = 50;
    sword.slow = { until: 100, multiplier: 3 };
    castSkill(ctx, sword, target);
    expect(sword.slow).toBeUndefined();
    ctx.tick = 14;
    advanceBladeStorm(ctx, sword);
    expect(ctx.events[0].amount).toBe(100);
    expect(sword.hp).toBe(100);
    expect(ctx.events.at(-1)).toMatchObject({
      reflected: true,
      immune: true,
      amount: 0,
    });
  });
  it("完整模拟追击新的目标，旋转期间不普攻且保持占位；快速和Worker一致", () => {
    const left = [p("swordthrall", 1, 3)],
      right = [p("fish", 2, 1, 35), p("whale", 3, 3, 57)];
    left[0].items = ["staff", "staff", "staff"];
    const before = structuredClone([left, right]),
      b = simulate(left, right),
      active = b.frames.filter(
        (fr) => fr.fighters.find((f) => f.uid === 1)!.bladeStorm,
      );
    expect(
      new Set(
        active.map((fr) => {
          const s = fr.fighters.find((f) => f.uid === 1)!;
          return `${s.x},${s.y}`;
        }),
      ).size,
    ).toBeGreaterThan(1);
    expect(
      active.every((fr) =>
        fr.events.filter((e) => e.attacker === 1).every((e) => e.skill),
      ),
    ).toBe(true);
    for (const fr of b.frames) {
      const alive = fr.fighters.filter((f) => f.hp > 0);
      expect(new Set(alive.map((f) => `${f.x},${f.y}`)).size).toBe(
        alive.length,
      );
    }
    const fast = simulateOutcome(left, right);
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect(
      compute({ kind: "replay", left, right, version: "armored" }),
    ).toEqual({ kind: "replay", battle: b });
    expect([left, right]).toEqual(before);
  });
  it("傀儡先锋演示产生6次一轮脉冲、技能免疫事件和真实战报", () => {
    const b = simulate(SWORDTHRALL_DEMO.left, SWORDTHRALL_DEMO.right),
      events = b.frames.flatMap((fr) => fr.events);
    expect(
      b.frames
        .flatMap((fr) => fr.effects)
        .filter((e) => e.source === 101 && e.kind === "pulse"),
    ).toHaveLength(12);
    expect(events.some((e) => e.target === 101 && e.immune)).toBe(true);
    expect(
      events
        .filter((e) => e.attacker === 101)
        .reduce((n, e) => n + e.amount, 0),
    ).toBe(b.frames.at(-1)!.fighters.find((f) => f.uid === 101)!.damage);
  });
  it("正常购买三合一与出售守恒、AI可招募部署", () => {
    const g = createGame(91, "classic"),
      me = g.players[0];
    clearShops(g);
    for (let i = 0; i < 3; i++) {
      me.shop[0] = "swordthrall";
      g.pool.swordthrall--;
      expect(buy(g, me, 0)).toBe(true);
    }
    expect(me.gold).toBe(4);
    expect(me.pieces[0].star).toBe(2);
    expect(validGame(g)).toBe(true);
    sell(g, me, me.pieces[0].uid);
    expect(g.pool.swordthrall).toBe(30);
    const bot = g.players[1];
    bot.gold = 2;
    bot.shop[0] = "swordthrall";
    g.pool.swordthrall--;
    prepareBot(g, bot, { buy, sell, roll, buyXp });
    expect(
      bot.pieces.some((p) => p.defId === "swordthrall" && p.position !== null),
    ).toBe(true);
    expect(bot.gold).toBe(0);
    expect(validGame(g)).toBe(true);
  });
  for (const fixture of frozen.fixtures)
    it(`0.32旧回放${fixture.name}逐帧不变`, async () => {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(simulate(fixture.left, fixture.right, "armored")),
        ),
      );
      expect(
        Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(fixture.hash);
    });
});

describe("剑奴禁用感知迁移", () => {
  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`${banned}/${phase}旧0.32只补剑奴卡池`, () => {
        const g = createGame(137, "classic"),
          me = g.players[0];
        clearShops(g);
        g.bannedSeries = (
          banned ? ["傀儡", "猛禽", "陆行者"] : ["装甲", "猛禽", "陆行者"]
        ) as Series[];
        for (const id of Object.keys(g.pool))
          if (!isRecruitable(g, id)) g.pool[id] = 0;
        me.shop[0] = phase === "finished" ? "fish" : "guard";
        g.pool[me.shop[0]]--;
        buy(g, me, 0);
        move(g, me, me.pieces[0].uid, 35);
        if (phase === "finished") me.hp = 1;
        let result: ReturnType<typeof startRound> = null;
        if (phase !== "prepare") {
          result = startRound(g);
          if (phase !== "battle") settle(g, result!);
        }
        for (const q of g.players) {
          q.shop = q.shop.map((id) => (id === "swordthrall" ? null : id));
          q.pieces = q.pieces.filter((p) => p.defId !== "swordthrall");
        }
        g.pool.swordthrall = banned ? 0 : COPIES[2];
        expect(g.phase).toBe(phase);
        expect(validGame(g)).toBe(true);
        delete g.pool.swordthrall;
        const before = structuredClone(g),
          d = decodeSave(save(g, 31, "singleplayer-0.32"));
        expect(d.status).toBe("migrated");
        expect(d.data!.game).toEqual({
          ...before,
          pool: { ...before.pool, swordthrall: banned ? 0 : 30 },
        });
        expect(validGame(d.data!.game)).toBe(true);
        expect(d.data!.playback).toEqual({ time: 2, speed: 2, paused: true });
        if (phase === "battle")
          expect(resumeRound(d.data!.game)!.battle).toEqual(result!.battle);
      });
});
