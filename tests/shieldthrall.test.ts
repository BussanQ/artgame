import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  gainMana,
  advanceAirSkills,
  type CombatContext,
} from "../src/engine/abilities";
import { shieldWaveCells } from "../src/engine/shieldthrall";
import { bladeStrike } from "../src/engine/bladethrall";
import { startFaithArrow, advanceFaithArrow } from "../src/engine/birdrider";
import { isUndying } from "../src/engine/immortality";
import { isPhoenixEgg } from "../src/engine/phoenix";
import { skillGauge, usesEnergy } from "../src/engine/triggers";
import { prepareBot, abilityCredit } from "../src/engine/ai";
import {
  buy,
  buyXp,
  createGame,
  move,
  roll,
  sell,
  startRound,
  settle,
  resumeRound,
} from "../src/engine/game";
import { itemScore } from "../src/engine/equipment";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { isRecruitable, type Series } from "../src/engine/rotation";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { compute } from "../src/compute/job";
import { COPIES, RULES, UNIT } from "../src/data/units";
import { SHIELD_WAVE, skillDescription } from "../src/data/skills";
import { SHIELDTHRALL_DEMO } from "../src/data/shieldthrall-demo";
import type { Fighter, Game, Piece } from "../src/engine/types";
import { CURRENT_COMBAT_VERSION } from "../src/engine/types";
import frozen from "./fixtures/pre-v035-replays.json";

const p = (
  defId: string,
  uid: number,
  star = 1,
  position: number | null = 35,
): Piece => ({ defId, uid, star, position });
const f = (defId: string, uid: number, side: 0 | 1, star = 1) =>
  Object.assign(army([p(defId, uid, star)], side)[0], {
    x: 3,
    y: side ? 2 : 3,
    mana: 100,
    shield: 0,
    magicResist: 0,
  });
function setup(star = 1) {
  const shield = f("shieldthrall", 1, 0, star),
    target = f("guard", 2, 1, 3);
  target.hp = target.maxHp = 10000;
  const ctx: CombatContext = {
    fighters: [shield, target],
    tick: 10,
    events: [],
    effects: [],
  };
  return { shield, target, ctx };
}
const envelope = (game: Game) =>
  JSON.stringify({
    schema: 33,
    rules: "singleplayer-0.34",
    savedAt: 1,
    revision: 1,
    game,
    playback: { time: 2, speed: 2, paused: true },
  });
function clearShops(g: Game) {
  for (const q of g.players) {
    for (const id of q.shop) if (id) g.pool[id]++;
    q.shop = [null, null, null, null, null];
  }
}

describe("盾奴正义冲锋", () => {
  it.each([1, 2, 3])("%i星属性、固定技能成长及法术减伤", (star) => {
    expect(UNIT.shieldthrall).toMatchObject({
      cost: 4,
      traits: ["傀儡", "护卫"],
      hp: 1050,
      attack: 106,
      armor: 5,
      range: 1,
      interval: 5,
      initialMana: 25,
    });
    const fresh = army([p("shieldthrall", 1, star)], 0)[0];
    expect(fresh).toMatchObject({
      maxHp: 1050 * 2 ** (star - 1),
      attack: 106 * 2 ** (star - 1),
      mana: 25,
    });
    expect(usesEnergy(fresh)).toBe(true);
    expect(skillGauge(fresh).progress).toBe(0.25);
    const { shield, target, ctx } = setup(star);
    target.magicResist = 0.25;
    target.armor = 999;
    Object.assign(target.air!, { flying: true, evasion: 1 });
    const before = {
      x: shield.x,
      y: shield.y,
      armor: shield.armor,
      shield: shield.shield,
    };
    shield.skillPower = 1.5;
    shield.attack = 9999;
    expect(castSkill(ctx, shield, target)).toBe(true);
    expect(ctx.events).toHaveLength(1);
    expect(ctx.events[0]).toMatchObject({
      amount: Math.round(SHIELD_WAVE.damage[star - 1] * 1.5 * 0.75),
      damageType: "magic",
      skill: true,
      primary: true,
      ranged: false,
    });
    expect(shield).toMatchObject({ ...before, mana: 0, skillReadyAt: 50 });
    expect(shield.signature?.casts).toBe(1);
    expect(target.silenceUntil).toBe(18);
    expect(ctx.effects.filter((e) => e.kind === "silence")).toHaveLength(1);
    expect(skillDescription("shieldthrall")).toContain("200/300/400");
  });
  it.each([
    { x: 3, y: 2 },
    { x: 3, y: 4 },
    { x: 2, y: 3 },
    { x: 4, y: 3 },
  ])("矩形随合法相邻目标朝向转动：%j", (to) => {
    const { shield, target, ctx } = setup();
    Object.assign(target, to);
    const cells = shieldWaveCells(shield, target);
    expect(cells).toHaveLength(9);
    expect(cells).toContainEqual(to);
    expect(cells).not.toContainEqual({ x: shield.x, y: shield.y });
    const dx = to.x - shield.x,
      dy = to.y - shield.y;
    for (const cell of cells) {
      const rx = cell.x - shield.x,
        ry = cell.y - shield.y;
      expect(rx * dx + ry * dy).toBeGreaterThan(0);
      expect(rx * dx + ry * dy).toBeLessThanOrEqual(3);
      expect(Math.abs(rx * dy - ry * dx)).toBeLessThanOrEqual(1);
    }
    expect(castSkill(ctx, shield, target)).toBe(true);
    expect(ctx.effects.find((e) => e.kind === "pulse")).toMatchObject({
      from: { x: 3, y: 3 },
      to,
    });
  });
  it("棋盘边缘截断、零方向为空，斜向几何不包括身后或侧后方", () => {
    expect(shieldWaveCells({ x: 0, y: 1 }, { x: 0, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    expect(shieldWaveCells({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual([]);
    const diagonal = shieldWaveCells({ x: 3, y: 3 }, { x: 4, y: 2 });
    expect(diagonal).toContainEqual({ x: 4, y: 2 });
    expect(diagonal).not.toContainEqual({ x: 2, y: 4 });
    expect(
      diagonal.every(
        (cell) => cell.x >= 0 && cell.x < 8 && cell.y >= 0 && cell.y < 8,
      ),
    ).toBe(true);
  });
  it("同时命中前方矩形中的空中与隐蔽敌人，排除侧面、身后、远处和友军", () => {
    const { shield, target, ctx } = setup();
    const cells = shieldWaveCells(shield, target);
    ctx.fighters = [
      shield,
      ...cells.map((cell, i) =>
        Object.assign(f(i % 2 ? "ghostjet" : "guard", 10 + i, 1, 3), cell, {
          hp: 10000,
          maxHp: 10000,
        }),
      ),
    ];
    for (const enemy of ctx.fighters.slice(1))
      if (enemy.air) enemy.air.phaseUntil = 100;
    const primary = ctx.fighters.find(
      (enemy) => enemy.x === 3 && enemy.y === 2,
    )!;
    primary.air!.phaseUntil = 0;
    const excluded = [
      Object.assign(f("guard", 30, 1), { x: 1, y: 2 }),
      Object.assign(f("guard", 31, 1), { x: 2, y: 3 }),
      Object.assign(f("guard", 32, 1), { x: 3, y: 4 }),
      Object.assign(f("guard", 33, 0), { x: 4, y: 2 }),
    ];
    ctx.fighters.push(...excluded);
    expect(castSkill(ctx, shield, primary)).toBe(true);
    expect(ctx.events.filter((e) => e.attacker === shield.uid)).toHaveLength(9);
    expect(ctx.events.filter((e) => e.primary)).toHaveLength(1);
    expect(ctx.effects.filter((e) => e.kind === "silence")).toHaveLength(9);
    expect(
      excluded.every(
        (enemy) => !enemy.silenceUntil && enemy.hp === enemy.maxHp,
      ),
    ).toBe(true);
  });
  it.each([
    "dead",
    "stun",
    "silence",
    "charm",
    "energy",
    "cooldown",
    "far",
    "ally",
    "concealed",
    "deadTarget",
    "summon",
  ])("%s阻止启动且不扣能量或冷却", (reason) => {
    const { shield, target, ctx } = setup();
    if (reason === "dead") shield.hp = 0;
    if (reason === "stun") shield.stunUntil = 11;
    if (reason === "silence") shield.silenceUntil = 11;
    if (reason === "charm")
      shield.charm = { until: 11, attack: shield.attack, side: 0 };
    if (reason === "energy") shield.mana = 99;
    if (reason === "cooldown") shield.skillReadyAt = 11;
    if (reason === "far") target.y = 0;
    if (reason === "ally") target.side = 0;
    if (reason === "concealed") target.air!.phaseUntil = 11;
    if (reason === "deadTarget") target.hp = 0;
    if (reason === "summon") shield.summon = { owner: 9, born: 0 };
    const before = structuredClone(ctx);
    expect(castSkill(ctx, shield, target)).toBe(false);
    expect(ctx).toEqual(before);
  });
  it("回充可继续积累能量，十秒冷却到期才可再次施放", () => {
    const { shield, target, ctx } = setup();
    castSkill(ctx, shield, target);
    gainMana(shield, 100, 11);
    expect(shield.mana).toBe(100);
    ctx.tick = 49;
    expect(castSkill(ctx, shield, target)).toBe(false);
    expect(shield.mana).toBe(100);
    ctx.tick = 50;
    expect(castSkill(ctx, shield, target)).toBe(true);
    expect(shield.signature?.casts).toBe(2);
    expect(shield.skillReadyAt).toBe(90);
  });
  it("护盾吸收法伤仍可沉默，不触发普攻吸血、破甲或硬控", () => {
    const { shield, target, ctx } = setup();
    shield.hp = 100;
    shield.lifesteal = 0.6;
    shield.attackShred = 10;
    target.shield = 300;
    castSkill(ctx, shield, target);
    expect(ctx.events[0]).toMatchObject({
      amount: 0,
      absorbed: 200,
      skill: true,
    });
    expect(target.shield).toBe(100);
    expect(target.silenceUntil).toBe(18);
    expect(target.stunUntil).toBe(0);
    expect(target.armorBreak).toBe(0);
    expect(shield.hp).toBe(100);
    expect(target).toMatchObject({ x: 3, y: 2 });
  });
  it.each(["bomber", "ironape", "specialist"])(
    "沉默立即打断%s引导，不退能量且到期恢复施法",
    (id) => {
      const { shield, ctx } = setup();
      const target = f(id, 2, 1, 3);
      target.hp = target.maxHp = 10000;
      ctx.fighters = [shield, target];
      expect(castSkill(ctx, target, shield)).toBe(true);
      expect(target.air?.cast).toBeDefined();
      const readyAt = target.skillReadyAt;
      castSkill(ctx, shield, target);
      expect(target.air?.cast).toBeUndefined();
      expect(target.mana).toBe(10);
      expect(target.skillReadyAt).toBe(readyAt);
      ctx.events = [];
      ctx.tick = 11;
      expect(advanceAirSkills(ctx, target)).toBe(false);
      expect(ctx.events).toHaveLength(0);
      target.mana = 100;
      target.skillReadyAt = 0;
      expect(castSkill(ctx, target, shield)).toBe(false);
      ctx.tick = 18;
      expect(castSkill(ctx, target, shield)).toBe(true);
    },
  );
  it("沉默不打断鸟骑兵蓄力普攻，也不阻止刀奴被动", () => {
    const { shield, ctx } = setup();
    const bird = f("birdrider", 2, 1),
      blade = Object.assign(f("bladethrall", 3, 1), { x: 4, y: 2 });
    ctx.fighters = [shield, bird, blade];
    bird.bird!.shots = 6;
    expect(startFaithArrow(ctx, bird, shield)).toBe(true);
    const draw = structuredClone(bird.bird!.draw);
    castSkill(ctx, shield, bird);
    expect(bird.silenceUntil).toBe(18);
    expect(bird.bird!.draw).toEqual(draw);
    ctx.tick = 12;
    expect(advanceFaithArrow(ctx, bird)).toBe(true);
    expect(ctx.events.some((e) => e.attacker === bird.uid && !e.skill)).toBe(
      true,
    );
    blade.x = 3;
    blade.y = 2;
    expect(blade.silenceUntil).toBe(18);
    expect(bladeStrike(ctx, blade, shield)).toBe(true);
  });
  it("不缩短更长沉默，旋转剑奴免疫技能伤害与本次沉默", () => {
    const { shield, target, ctx } = setup();
    target.silenceUntil = 100;
    const sword = Object.assign(f("swordthrall", 3, 1, 3), { x: 4, y: 2 });
    ctx.fighters.push(sword);
    // Start against an adjacent enemy, then place its spinning body within the wave.
    shield.x = 4;
    shield.y = 3;
    expect(castSkill(ctx, sword, shield)).toBe(true);
    shield.x = 3;
    const hp = sword.hp;
    expect(castSkill(ctx, shield, target)).toBe(true);
    expect(target.silenceUntil).toBe(100);
    expect(sword.hp).toBe(hp);
    expect(sword.silenceUntil).toBeUndefined();
    expect(ctx.events.find((e) => e.target === sword.uid)).toMatchObject({
      immune: true,
      amount: 0,
    });
  });
  it.each(["dead", "immortal", "egg"])("致死命中后的%s不追加沉默", (kind) => {
    const { shield, ctx } = setup();
    const target = f(kind === "egg" ? "phoenix" : "guard", 2, 1, 2);
    target.hp = 1;
    if (kind === "immortal")
      target.immortal = { spent: false, until: 0, duration: 8 };
    ctx.fighters = [shield, target];
    expect(castSkill(ctx, shield, target)).toBe(true);
    expect(target.silenceUntil).toBeUndefined();
    expect(ctx.effects.some((e) => e.kind === "silence")).toBe(false);
    if (kind === "dead") expect(target.hp).toBe(0);
    if (kind === "immortal") expect(isUndying(target)).toBe(true);
    if (kind === "egg") expect(isPhoenixEgg(target)).toBe(true);
  });
  it("逐目标结算中被反伤击杀会停止余下目标，已命中目标保留沉默", () => {
    const { shield, target, ctx } = setup();
    shield.hp = 1;
    target.reflection = 10;
    const next = Object.assign(f("guard", 3, 1, 3), { x: 4, y: 2 });
    ctx.fighters.push(next);
    expect(castSkill(ctx, shield, target)).toBe(true);
    expect(shield.hp).toBe(0);
    expect(target.silenceUntil).toBe(18);
    expect(next.hp).toBe(next.maxHp);
    expect(next.silenceUntil).toBeUndefined();
    expect(ctx.events.filter((e) => e.attacker === shield.uid)).toHaveLength(1);
    expect(shield.signature?.casts).toBe(1);
  });
  it("初始能量装备和法强进入战斗，AI计入控制、法伤与前排装备", () => {
    const piece = p("shieldthrall", 1, 2);
    piece.items = ["staff", "sage", "fortress"];
    const fighter = army([piece], 0)[0];
    expect(fighter.mana).toBe(85);
    expect(fighter.skillPower).toBe(1.5);
    expect(fighter.armor).toBe(14);
    const plain = p("shieldthrall", 1, 2);
    expect(abilityCredit(piece)).toBeGreaterThan(abilityCredit(plain));
    expect(itemScore(plain, "fortress")).toBeGreaterThan(
      itemScore(p("infantry", 2), "fortress"),
    );
    expect(itemScore(plain, "staff")).toBeGreaterThan(0);
  });
  it("正常付费招募、三合一、出售和AI部署守恒", () => {
    const g = createGame(91, "classic"),
      me = g.players[0];
    clearShops(g);
    me.gold = 12;
    for (let i = 0; i < 3; i++) {
      me.shop[0] = "shieldthrall";
      g.pool.shieldthrall--;
      expect(buy(g, me, 0)).toBe(true);
    }
    expect(me.gold).toBe(0);
    expect(me.pieces[0].star).toBe(2);
    expect(validGame(g)).toBe(true);
    sell(g, me, me.pieces[0].uid);
    expect(g.pool.shieldthrall).toBe(COPIES[4]);
    const bot = g.players[1];
    bot.gold = 4;
    bot.shop[0] = "shieldthrall";
    g.pool.shieldthrall--;
    prepareBot(g, bot, { buy, sell, roll, buyXp });
    expect(
      bot.pieces.some(
        (piece) => piece.defId === "shieldthrall" && piece.position !== null,
      ),
    ).toBe(true);
    expect(bot.gold).toBe(0);
    expect(validGame(g)).toBe(true);
  });
  it("六对六演示产生真实矩形沉默，完整、快速与Worker回放一致且不修改参战棋子", () => {
    const before = structuredClone(SHIELDTHRALL_DEMO);
    const b = simulate(before.left, before.right),
      events = b.frames.flatMap((fr) => fr.events);
    const waves = b.frames.flatMap((fr) =>
      fr.effects.filter(
        (e) => e.source === 101 && e.kind === "pulse" && e.name === "正义冲锋",
      ),
    );
    expect(waves.length).toBeGreaterThan(0);
    expect(
      b.frames
        .flatMap((fr) => fr.effects)
        .filter((e) => e.source === 101 && e.kind === "silence"),
    ).toHaveLength(6);
    const row = analyzeBattle(b).sides[0].fighters.find(
      (row) => row.uid === 101,
    )!;
    expect(row.casts).toBe(waves.length);
    expect(row.skillDamage).toBe(
      events
        .filter((e) => e.attacker === 101 && e.skill)
        .reduce((sum, e) => sum + e.amount, 0),
    );
    expect(row.skillDamage).toBeGreaterThan(0);
    for (const frame of b.frames) {
      const alive = frame.fighters.filter((f) => f.hp > 0);
      expect(new Set(alive.map((f) => `${f.x},${f.y}`)).size).toBe(
        alive.length,
      );
    }
    expect(simulateOutcome(before.left, before.right).final.fighters).toEqual(
      b.frames.at(-1)!.fighters,
    );
    expect(
      compute({
        kind: "replay",
        left: before.left,
        right: before.right,
        version: CURRENT_COMBAT_VERSION,
      }),
    ).toEqual({ kind: "replay", battle: b });
    expect(SHIELDTHRALL_DEMO).toEqual(before);
  });
  for (const fixture of frozen.fixtures)
    it(`0.34旧回放${fixture.name}逐帧不变`, async () => {
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

describe("盾奴禁用感知迁移", () => {
  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`${banned}/${phase}旧0.34只补缺失盾奴卡池`, () => {
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
          q.shop = q.shop.map((id) => (id === "shieldthrall" ? null : id));
          q.pieces = q.pieces.filter((piece) => piece.defId !== "shieldthrall");
        }
        g.pool.shieldthrall = banned ? 0 : COPIES[4];
        expect(g.phase).toBe(phase);
        expect(validGame(g)).toBe(true);
        delete g.pool.shieldthrall;
        const before = structuredClone(g),
          decoded = decodeSave(envelope(g));
        expect(decoded.status).toBe("migrated");
        expect(decoded.data?.schema).toBe(SAVE_SCHEMA);
        expect(decoded.data?.rules).toBe(RULES.version);
        expect(decoded.data!.game).toEqual({
          ...before,
          pool: { ...before.pool, shieldthrall: banned ? 0 : COPIES[4] },
        });
        expect(decoded.data!.playback).toEqual({
          time: 2,
          speed: 2,
          paused: true,
        });
        expect(validGame(decoded.data!.game)).toBe(true);
        if (phase === "battle")
          expect(resumeRound(decoded.data!.game)!.battle).toEqual(
            result!.battle,
          );
      });
});
