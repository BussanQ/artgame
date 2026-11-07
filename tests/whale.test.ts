import { CURRENT_COMBAT_VERSION } from "../src/engine/types";
import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  advanceAirSkills,
  damage,
  type CombatContext,
} from "../src/engine/abilities";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { compute } from "../src/compute/job";
import {
  createGame,
  buy,
  startRound,
  settle,
  resumeRound,
} from "../src/engine/game";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { itemScore } from "../src/engine/equipment";
import { COPIES, UNIT } from "../src/data/units";
import type { Fighter, Piece } from "../src/engine/types";
const p = (defId: string, uid: number, star = 1, position = 35): Piece => ({
  defId,
  uid,
  star,
  position,
});
const f = (id: string, uid: number, side: 0 | 1 = 0, star = 1): Fighter =>
  Object.assign(army([p(id, uid, star)], side)[0], {
    x: 3,
    y: side ? 3 : 4,
    mana: 100,
    shield: 0,
  });
const ctx = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 10,
  events: [],
  effects: [],
});
describe("幻鲸固定潮汐区域", () => {
  it("延迟一秒、固定目标格，每秒一次十次；只命中当前范围内敌人", () => {
    const whale = f("whale", 1),
      a = f("guard", 2, 1),
      b = f("guard", 3, 1),
      ally = f("guard", 4);
    b.x = 7;
    ally.y = 3;
    const c = ctx(whale, a, b, ally);
    expect(castSkill(c, whale, a)).toBe(true);
    expect(whale.mana).toBe(0);
    expect(whale.air?.cast).toMatchObject({
      next: 14,
      remaining: 10,
      to: { x: 3, y: 3 },
    });
    c.tick = 13;
    advanceAirSkills(c, whale);
    expect(c.events).toHaveLength(0);
    a.x = 7;
    b.x = 3; // The original target leaves; another target walks into the locked field.
    c.tick = 14;
    advanceAirSkills(c, whale);
    expect(c.events.map((e) => e.target)).toEqual([b.uid]);
    expect(c.events[0].amount).toBe(Math.round(b.maxHp * 0.03));
    expect(c.events[0].damageType).toBe("true");
    expect(ally.hp).toBe(ally.maxHp);
    for (c.tick = 15; c.tick <= 50; c.tick++) advanceAirSkills(c, whale);
    expect(c.effects.filter((e) => e.kind === "pulse")).toHaveLength(10);
    expect(c.events).toHaveLength(10);
    expect(whale.air?.cast).toBeUndefined();
    expect(advanceAirSkills(c, whale)).toBe(false);
  });
  it("三档按目标最大生命计算，倍率在施法时锁定，不受攻速攻击或防御影响", () => {
    for (const star of [1, 2, 3]) {
      const whale = f("whale", 1, 0, star),
        a = f("guard", 2, 1),
        c = ctx(whale, a);
      a.maxHp = 10000;
      a.hp = 8000;
      a.armor = 999;
      a.magicResist = 0.99;
      whale.skillPower = 1.3;
      castSkill(c, whale, a);
      whale.skillPower = 9;
      whale.attack = 999999;
      c.tick = 14;
      advanceAirSkills(c, whale);
      expect(c.events[0].amount).toBe(
        Math.round(10000 * (0.02 + star * 0.01) * 1.3),
      );
    }
  });
  it("护盾吸收真实伤害，飞行闪避不躲技能，不朽残魂免伤", () => {
    const whale = f("whale", 1),
      shield = f("guard", 2, 1),
      soul = f("vine", 3, 1),
      c = ctx(whale, shield, soul);
    shield.maxHp = 1000;
    shield.hp = 1000;
    shield.shield = 20;
    shield.air!.flying = true;
    shield.air!.evasion = 1;
    soul.immortal = { duration: 16, until: 30, spent: true };
    castSkill(c, whale, shield);
    c.tick = 14;
    advanceAirSkills(c, whale);
    expect(c.events.find((e) => e.target === 2)).toMatchObject({
      absorbed: 20,
      amount: 10,
      damageType: "true",
    });
    expect(c.events.find((e) => e.target === 3)).toMatchObject({
      amount: 0,
      immune: true,
    });
    expect(shield.hp).toBe(990);
  });
  it("锁定范围含距离2格边界、排除距离3格，不追踪或误伤友军", () => {
    const whale = f("whale", 1),
      center = f("guard", 2, 1),
      edge = f("guard", 3, 1),
      out = f("guard", 4, 1);
    edge.x = 5;
    out.x = 6;
    const c = ctx(whale, center, edge, out);
    castSkill(c, whale, center);
    c.tick = 14;
    advanceAirSkills(c, whale);
    expect(c.events.map((e) => e.target).sort()).toEqual([2, 3]);
  });
  for (const reason of ["stun", "charm", "death"])
    it(reason + "终止后续潮汐", () => {
      const whale = f("whale", 1),
        enemy = f("guard", 2, 1),
        c = ctx(whale, enemy);
      castSkill(c, whale, enemy);
      if (reason === "stun") whale.stunUntil = 99;
      if (reason === "charm")
        whale.charm = { until: 99, attack: whale.attack, side: 0 };
      if (reason === "death") damage(c, enemy, whale, 99999, "true");
      c.tick = 14;
      advanceAirSkills(c, whale);
      expect(whale.air?.cast).toBeUndefined();
      expect(c.effects.some((e) => e.kind === "pulse")).toBe(false);
    });
  it("一次脉冲被反伤击杀后不再伤害余下目标", () => {
    const whale = f("whale", 1),
      first = f("guard", 2, 1),
      second = f("guard", 3, 1),
      c = ctx(whale, first, second);
    whale.hp = 1;
    first.reflection = 20;
    castSkill(c, whale, first);
    c.tick = 14;
    advanceAirSkills(c, whale);
    expect(whale.hp).toBe(0);
    expect(whale.air?.cast).toBeUndefined();
    expect(second.hp).toBe(second.maxHp);
    expect(c.events.some((e) => e.reflected)).toBe(true);
  });
});
describe("幻鲸完整战斗与集成", () => {
  const left = [
    { ...p("whale", 1, 2, 51), items: ["staff"] },
    p("guard", 2, 3, 35),
  ];
  const right = [p("turtle", 3, 3, 35), p("guard", 4, 3, 36)];
  it("完整、快速、Worker结果一致，引导不移动或普攻，分析统计真实伤害", () => {
    const battle = simulate(left, right);
    expect(simulate(left, right)).toEqual(battle);
    const fast = simulateOutcome(left, right);
    expect([fast.winner, fast.damage]).toEqual([battle.winner, battle.damage]);
    expect(fast.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
    const worker = compute({
      kind: "replay",
      left,
      right,
      version: CURRENT_COMBAT_VERSION,
    });
    expect(worker.kind).toBe("replay");
    if (worker.kind === "replay") expect(worker.battle).toEqual(battle);
    const events = battle.frames
      .flatMap((x) => x.events)
      .filter((e) => e.attacker === 1 && e.skill);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.damageType === "true")).toBe(true);
    for (let i = 1; i < battle.frames.length; i++) {
      const previous = battle.frames[i - 1].fighters.find((f) => f.uid === 1)!;
      const now = battle.frames[i].fighters.find((f) => f.uid === 1)!;
      if (previous.air?.cast && now.air?.cast) {
        expect([now.x, now.y]).toEqual([previous.x, previous.y]);
        expect(
          battle.frames[i].events.filter((e) => e.attacker === 1 && !e.skill),
        ).toHaveLength(0);
      }
    }
    const contribution = analyzeBattle(battle).sides[0].fighters.find(
      (u) => u.uid === 1,
    )!;
    expect(contribution.skillDamage).toBe(
      events.reduce((n, e) => n + e.amount, 0),
    );
  });
  it("能量/技能装备优先于纯攻击装备，飞行与海神身份独立", () => {
    expect(itemScore(p("whale", 1), "staff")).toBeGreaterThan(
      itemScore(p("whale", 1), "blade"),
    );
    const whale = army([p("whale", 1)], 0)[0];
    expect(whale.air?.flying).toBe(true);
    expect(UNIT.whale.traits).toEqual(["海神", "攻城"]);
    expect(UNIT.whale.cost).toBe(5);
  });
});
describe("0.17存档补充幻鲸卡池", () => {
  for (const phase of ["prepare", "battle", "result", "finished"] as const)
    it(phase + "不改变原资源与战斗结果", () => {
      const g = createGame(137, "classic");
      let battle: ReturnType<typeof startRound> | undefined;
      if (phase !== "prepare") {
        const player = g.players[0];
        if (player.shop[0]) g.pool[player.shop[0]]++;
        player.shop[0] = phase === "finished" ? "fish" : "guard";
        g.pool[player.shop[0]]--;
        buy(g, player, 0);
        player.pieces[0].position = 35;
        if (phase === "finished") player.hp = 1;
        battle = startRound(g);
        if (phase === "result" || phase === "finished") settle(g, battle!);
      }
      expect(g.phase).toBe(phase);
      delete g.pool.whale;
      const before = structuredClone(g);
      const decoded = decodeSave(
        JSON.stringify({
          schema: 16,
          rules: "singleplayer-0.17",
          savedAt: 1,
          revision: 1,
          game: g,
          playback: { time: 0, speed: 1, paused: false },
        }),
      );
      expect(decoded.status).toBe("migrated");
      expect(decoded.data?.schema).toBe(SAVE_SCHEMA);
      expect(decoded.data!.game).toEqual({
        ...before,
        pool: { ...before.pool, whale: COPIES[5] },
      });
      expect(validGame(decoded.data!.game)).toBe(true);
      if (phase === "battle")
        expect(resumeRound(decoded.data!.game)!.battle).toEqual(battle!.battle);
    });
});
