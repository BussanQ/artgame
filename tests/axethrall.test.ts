import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { castSkill, type CombatContext } from "../src/engine/abilities";
import { gainMana } from "../src/engine/abilities";
import { enterUndying } from "../src/engine/immortality";
import { enterPhoenixEgg } from "../src/engine/phoenix";
import {
  buy,
  buyXp,
  createGame,
  move,
  resumeRound,
  roll,
  sell,
  settle,
  startRound,
} from "../src/engine/game";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { isRecruitable, type Series } from "../src/engine/rotation";
import { abilityCredit, prepareBot } from "../src/engine/ai";
import { compute } from "../src/compute/job";
import { COPIES, RULES, UNIT } from "../src/data/units";
import { AXE_THROW } from "../src/data/skills";
import { AXETHRALL_DEMO } from "../src/data/axethrall-demo";
import { pieceDetails } from "../src/ui/bench-tooltip";
import type { Fighter, Game, Piece } from "../src/engine/types";

const p = (
  defId: string,
  uid: number,
  star = 1,
  position: number | null = 35,
): Piece => ({ defId, uid, star, position });
const f = (id: string, uid: number, side: 0 | 1, star = 1): Fighter =>
  Object.assign(army([p(id, uid, star)], side)[0], {
    x: 2,
    y: side ? 5 : 2,
    mana: 100,
    shield: 0,
    magicResist: 0,
  });
const setup = (star = 1) => {
  const source = f("axethrall", 1, 0, star),
    target = f("turtle", 2, 1, 3);
  const ctx: CombatContext = {
    fighters: [source, target],
    tick: 10,
    events: [],
    effects: [],
  };
  return { source, target, ctx };
};
function emptyShops(g: Game) {
  for (const q of g.players) {
    for (const id of q.shop) if (id) g.pool[id]++;
    q.shop = [null, null, null, null, null];
  }
}
const save = (g: Game, schema = SAVE_SCHEMA, rules = RULES.version) =>
  JSON.stringify({
    schema,
    rules,
    savedAt: 1,
    revision: 1,
    game: g,
    playback: { time: 3, speed: 2, paused: true },
  });

describe("斧奴飞斧与近战定位", () => {
  it("一费傀儡刺杀、基础属性、低初始能量与独立动作说明", () => {
    expect(UNIT.axethrall).toMatchObject({
      cost: 1,
      traits: ["傀儡", "刺杀"],
      hp: 550,
      attack: 97,
      armor: 5,
      range: 1,
      interval: 7,
      initialMana: 0,
    });
    expect(army([p("axethrall", 1, 3)], 0)[0]).toMatchObject({
      maxHp: 2200,
      attack: 388,
      armor: 5,
      mana: 0,
    });
    expect(pieceDetails(p("axethrall", 1)).action).toBe("侧身引斧斜劈");
  });
  it.each([1, 2, 3])(
    "%i星单目标法伤按300/500/700增长，受技能强度影响且不随普攻变动",
    (star) => {
      const { source, target, ctx } = setup(star),
        other = f("turtle", 3, 1, 3);
      ctx.fighters.push(other);
      source.attack = 9999;
      source.skillPower = 1.5;
      expect(castSkill(ctx, source, target)).toBe(true);
      expect(ctx.events).toHaveLength(1);
      expect(ctx.events[0]).toMatchObject({
        attacker: 1,
        target: 2,
        skill: true,
        damageType: "magic",
        amount: AXE_THROW.damage[star - 1] * 1.5,
      });
      expect(other.hp).toBe(other.maxHp);
      expect(source.mana).toBe(0);
      expect(source.skillReadyAt).toBe(30);
      expect(target.stunUntil).toBe(13); // Current tick plus two blocked ticks.
      expect(ctx.effects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "pulse", name: "飞斧" }),
          expect.objectContaining({ kind: "stun", amount: 0.5 }),
        ]),
      );
    },
  );
  it.each([
    "mana",
    "cooldown",
    "stun",
    "silence",
    "charm",
    "dead",
    "target-dead",
    "friendly",
    "far",
    "concealed",
  ])("%s阻止施放且不消耗能量或创建效果", (reason) => {
    const { source, target, ctx } = setup();
    if (reason === "mana") source.mana = 99;
    if (reason === "cooldown") source.skillReadyAt = 11;
    if (reason === "stun") source.stunUntil = 11;
    if (reason === "silence") source.silenceUntil = 11;
    if (reason === "charm")
      source.charm = { side: 0, attack: source.attack, until: 20 };
    if (reason === "dead") source.hp = 0;
    if (reason === "target-dead") target.hp = 0;
    if (reason === "friendly") target.side = 0;
    if (reason === "far") target.y = 6;
    if (reason === "concealed") target.air!.phaseUntil = 11;
    const before = structuredClone(ctx);
    expect(castSkill(ctx, source, target)).toBe(false);
    expect(ctx).toEqual(before);
  });
  it("5秒冷却到边界才可再投掷，冷却不阻止回能", () => {
    const { source, target, ctx } = setup();
    castSkill(ctx, source, target);
    gainMana(source, 100, 11);
    expect(source.mana).toBe(100);
    ctx.tick = 29;
    expect(castSkill(ctx, source, target)).toBe(false);
    ctx.tick = 30;
    expect(castSkill(ctx, source, target)).toBe(true);
    expect(source.skillReadyAt).toBe(50);
  });
  it("法抗、护盾正常结算，不触发普攻破甲或吸血，也不缩短已有控制", () => {
    const { source, target, ctx } = setup();
    source.hp = 100;
    source.lifesteal = 1;
    source.attackShred = 10;
    target.magicResist = 0.25;
    target.armor = 999;
    target.shield = 100;
    target.shieldUntil = 100;
    target.stunUntil = 50;
    castSkill(ctx, source, target);
    expect(ctx.events[0]).toMatchObject({ amount: 125, absorbed: 100 });
    expect(source.hp).toBe(100);
    expect(target.armorBreak).toBe(0);
    expect(target.stunUntil).toBe(50);
  });
  it("命中打断敌方持续施法，飞斧为即时结算且自身无需持续引导", () => {
    const { source, target, ctx } = setup();
    target.air!.cast = {
      kind: "specialist",
      next: 13,
      target: 1,
      remaining: 1,
      damage: 100,
      from: { x: 2, y: 5 },
      to: { x: 2, y: 2 },
    };
    castSkill(ctx, source, target);
    expect(target.air!.cast).toBeUndefined();
    expect(source.air!.cast).toBeUndefined();
  });
  it("击杀不追加眩晕，残魂与化蛋不被飞斧控制", () => {
    const a = setup();
    a.target.hp = 1;
    castSkill(a.ctx, a.source, a.target);
    expect(a.target.hp).toBe(0);
    expect(a.ctx.effects.some((e) => e.kind === "stun")).toBe(false);
    const b = setup();
    b.target.immortal = { duration: 16, until: 0, spent: false };
    b.target.hp = 0;
    expect(enterUndying(b.ctx, b.target)).toBe(true);
    b.ctx.events = [];
    b.ctx.effects = [];
    const hp = b.target.hp;
    castSkill(b.ctx, b.source, b.target);
    expect(b.target.hp).toBe(hp);
    expect(b.ctx.events[0].immune).toBe(true);
    expect(b.ctx.effects.some((e) => e.kind === "stun")).toBe(false);
    const c = setup();
    const phoenix = f("phoenix", 4, 1, 2);
    c.ctx.fighters.push(phoenix);
    phoenix.hp = 0;
    expect(enterPhoenixEgg(c.ctx, phoenix)).toBe(true);
    c.ctx.effects = [];
    castSkill(c.ctx, c.source, phoenix);
    expect(c.ctx.effects.some((e) => e.kind === "stun")).toBe(false);
  });
  it("反伤击杀施法者只结算一次，效果不会循环递归", () => {
    const { source, target, ctx } = setup();
    source.hp = 10;
    target.reflection = 30;
    expect(castSkill(ctx, source, target)).toBe(true);
    expect(source.hp).toBe(0);
    expect(ctx.events.filter((e) => e.attacker === 1)).toHaveLength(1);
    expect(ctx.events.filter((e) => e.reflected)).toHaveLength(1);
  });
  it("完整模拟允许3格飞斧，但所有普攻仍相邻；完整、快速与Worker结果一致", () => {
    const left = [p("axethrall", 1, 2, 51)],
      right = [p("turtle", 2, 3, 35)];
    left[0].items = ["staff", "staff", "staff"];
    const before = structuredClone([left, right]),
      b = simulate(left, right);
    const events = b.frames
      .flatMap((fr) => fr.events)
      .filter((e) => e.attacker === 1);
    expect(
      events.some(
        (e) =>
          e.skill &&
          Math.abs(e.from.x - e.to.x) + Math.abs(e.from.y - e.to.y) === 3,
      ),
    ).toBe(true);
    expect(events.some((e) => !e.skill)).toBe(true);
    for (const e of events.filter((e) => !e.skill))
      expect(
        Math.abs(e.from.x - e.to.x) + Math.abs(e.from.y - e.to.y),
      ).toBeLessThanOrEqual(1);
    for (const e of events.filter((e) => e.skill))
      expect(
        Math.abs(e.from.x - e.to.x) + Math.abs(e.from.y - e.to.y),
      ).toBeLessThanOrEqual(3);
    const fast = simulateOutcome(left, right);
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect([fast.winner, fast.damage]).toEqual([b.winner, b.damage]);
    expect(
      compute({ kind: "replay", left, right, version: "armored" }),
    ).toEqual({ kind: "replay", battle: b });
    expect([left, right]).toEqual(before);
  });
  it("演示触发开场刺杀、普攻和飞斧，5秒施法间隔与事件总伤害一致", () => {
    const b = simulate(AXETHRALL_DEMO.left, AXETHRALL_DEMO.right);
    expect(b.frames[0].fighters.find((f) => f.uid === 101)!.y).toBeLessThan(4);
    const casts = b.frames
      .filter((fr) =>
        fr.effects.some((e) => e.source === 101 && e.kind === "cast"),
      )
      .map((fr) => fr.tick);
    expect(casts.length).toBeGreaterThan(0);
    for (let i = 1; i < casts.length; i++)
      expect(casts[i] - casts[i - 1]).toBeGreaterThanOrEqual(20);
    const events = b.frames
      .flatMap((fr) => fr.events)
      .filter((e) => e.attacker === 101);
    expect(events.some((e) => !e.skill)).toBe(true);
    expect(events.reduce((n, e) => n + e.amount, 0)).toBe(
      b.frames.at(-1)!.fighters.find((f) => f.uid === 101)!.damage,
    );
  });
  it("9张一费正常付款合为三星，出售回池；AI可用傀儡刺杀连接购买", () => {
    const g = createGame(91, "classic"),
      me = g.players[0];
    emptyShops(g);
    for (let i = 0; i < 9; i++) {
      me.shop[0] = "axethrall";
      g.pool.axethrall--;
      expect(buy(g, me, 0)).toBe(true);
    }
    expect(me.gold).toBe(1);
    expect(me.pieces).toHaveLength(1);
    expect(me.pieces[0].star).toBe(3);
    expect(validGame(g)).toBe(true);
    sell(g, me, me.pieces[0].uid);
    expect(g.pool.axethrall).toBe(COPIES[1]);
    const bot = g.players[1];
    bot.aiProfile = "assassins";
    bot.gold = 1;
    bot.shop[0] = "axethrall";
    g.pool.axethrall--;
    prepareBot(g, bot, { buy, sell, roll, buyXp });
    expect(
      bot.pieces.some((p) => p.defId === "axethrall" && p.position !== null),
    ).toBe(true);
    expect(bot.gold).toBe(0);
    expect(validGame(g)).toBe(true);
    expect(abilityCredit(p("axethrall", 1, 1))).toBeGreaterThan(
      abilityCredit(p("axethrall", 1, 3)),
    );
  });
});

describe("0.31旧卡池迁移至斧奴版本", () => {
  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`${banned ? "禁用傀儡" : "允许傀儡"}/${phase}只补对应份数，保留禁用、商店、资源及回放`, () => {
        const g = createGame(137, "classic"),
          me = g.players[0];
        emptyShops(g);
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
        // Reconstruct a pre-addition save: old games cannot hold or offer the new unit.
        for (const q of g.players) {
          q.shop = q.shop.map((id) => (id === "axethrall" ? null : id));
          q.pieces = q.pieces.filter((p) => p.defId !== "axethrall");
        }
        g.pool.axethrall = banned ? 0 : COPIES[1];
        expect(g.phase).toBe(phase);
        expect(validGame(g)).toBe(true);
        delete g.pool.axethrall;
        const before = structuredClone(g),
          decoded = decodeSave(save(g, 30, "singleplayer-0.31"));
        expect(decoded.status).toBe("migrated");
        expect(decoded.data!.game).toEqual({
          ...before,
          pool: { ...before.pool, axethrall: banned ? 0 : COPIES[1] },
        });
        expect(validGame(decoded.data!.game)).toBe(true);
        expect(decoded.data!.playback).toEqual({
          time: 3,
          speed: 2,
          paused: true,
        });
        if (phase === "battle")
          expect(resumeRound(decoded.data!.game)!.battle).toEqual(
            result!.battle,
          );
        expect(decodeSave(save(decoded.data!.game)).status).toBe("saved");
      });
});
