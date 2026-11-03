import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  advanceAirSkills,
  damage,
  type CombatContext,
} from "../src/engine/abilities";
import { silence } from "../src/engine/infantry-skills";
import { abilityCredit, deployLineup } from "../src/engine/ai";
import { compute } from "../src/compute/job";
import { UNIT, COPIES } from "../src/data/units";
import {
  createGame,
  buy,
  startRound,
  settle,
  resumeRound,
} from "../src/engine/game";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import type { Piece, Fighter } from "../src/engine/types";
const p = (
  defId: string,
  uid: number,
  star = 1,
  position: number | null = 35,
): Piece => ({ defId, uid, star, position });
const f = (id: string, uid: number, side: 0 | 1 = 0, star = 1): Fighter =>
  Object.assign(army([p(id, uid, star)], side)[0], {
    x: 3,
    y: side ? 3 : 4,
    mana: 100,
    shield: 0,
    magicResist: 0,
  });
const ctx = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 10,
  events: [],
  effects: [],
});
describe("摩托骑兵逐发转火", () => {
  it("三档固定法伤在0.5/1/1.5秒逐发结算，锁定施法强度而不使用攻击加成", () => {
    for (const star of [1, 2, 3]) {
      const a = f("motorcycle", 1, 0, star),
        b = f("turtle", 2, 1, 3),
        c = ctx(a, b);
      a.skillPower = 1.2;
      a.attack = 9999;
      expect(castSkill(c, a, b)).toBe(true);
      expect(c.events).toHaveLength(0);
      expect(a.skillReadyAt).toBe(50);
      a.skillPower = 9;
      c.tick = 11;
      advanceAirSkills(c, a);
      expect(c.events).toHaveLength(0);
      for (c.tick = 12; c.tick <= 16; c.tick++) advanceAirSkills(c, a);
      expect(c.events.map((e) => e.amount)).toEqual(
        Array(3).fill(120 * 2 ** (star - 1)),
      );
      expect(
        c.events.every(
          (e) => e.skill && e.primary && e.ranged && e.damageType === "magic",
        ),
      ).toBe(true);
      expect(c.effects.filter((e) => e.kind === "cast")).toHaveLength(1);
      expect(a.air!.cast).toBeUndefined();
    }
  });
  it("击杀后重新选择最近目标，同距离按UID排序，无范围伤害", () => {
    const a = f("motorcycle", 1),
      b = f("infantry", 2, 1),
      d = f("infantry", 3, 1),
      e = f("guard", 4, 1),
      ally = f("guard", 5);
    b.hp = 1;
    d.hp = 1;
    d.x = 2;
    e.x = 4;
    const c = ctx(a, e, d, b, ally);
    castSkill(c, a, b);
    for (c.tick = 12; c.tick <= 16; c.tick += 2) advanceAirSkills(c, a);
    expect(c.events.map((e) => e.target)).toEqual([2, 3, 4]);
    expect(ally.hp).toBe(ally.maxHp);
  });
  it("每发重查隐蔽、阵营和射程；无可见目标取消，不攻击友方或射程外", () => {
    const a = f("motorcycle", 1),
      b = f("guard", 2, 1),
      d = f("guard", 3, 1),
      c = ctx(a, b, d);
    castSkill(c, a, b);
    c.tick = 12;
    advanceAirSkills(c, a);
    b.air!.phaseUntil = 40;
    d.side = 0;
    c.tick = 14;
    advanceAirSkills(c, a);
    expect(c.events).toHaveLength(1);
    expect(a.air!.cast).toBeUndefined();
    expect(a.skillReadyAt).toBe(50);
    const far = f("guard", 4, 1);
    far.y = 0;
    a.mana = 100;
    c.tick = 50;
    c.fighters.push(far);
    expect(castSkill(c, a, far)).toBe(false);
    expect(a.mana).toBe(100);
  });
  for (const interrupt of ["stun", "silence", "charm", "death"] as const)
    it(interrupt + "取消余弹，能量与冷却不返还", () => {
      const a = f("motorcycle", 1),
        b = f("guard", 2, 1),
        c = ctx(a, b);
      castSkill(c, a, b);
      c.tick = 12;
      advanceAirSkills(c, a);
      if (interrupt === "stun") a.stunUntil = 30;
      if (interrupt === "silence") silence(c, b, a, 8);
      if (interrupt === "charm") {
        a.charm = { until: 30, side: 0, attack: a.attack };
        a.side = 1;
      }
      if (interrupt === "death") damage(c, b, a, 99999, "true", true);
      c.tick = 14;
      advanceAirSkills(c, a);
      c.tick = 16;
      advanceAirSkills(c, a);
      expect(c.events.filter((e) => e.attacker === 1)).toHaveLength(1);
      expect(a.air!.cast).toBeUndefined();
      expect(a.skillReadyAt).toBe(50);
    });
  it("冷却期间保留满能量并可普攻，到期才重新消耗能量", () => {
    const a = f("motorcycle", 1),
      b = f("turtle", 2, 1, 3),
      c = ctx(a, b);
    castSkill(c, a, b);
    for (c.tick = 12; c.tick <= 16; c.tick += 2) advanceAirSkills(c, a);
    a.mana = 100;
    c.tick = 49;
    expect(castSkill(c, a, b)).toBe(false);
    expect(a.mana).toBe(100);
    const hp = b.hp;
    damage(c, a, b, a.attack);
    expect(b.hp).toBeLessThan(hp);
    c.tick = 50;
    expect(castSkill(c, a, b)).toBe(true);
    expect(a.mana).toBe(0);
    expect(a.skillReadyAt).toBe(90);
  });
  it("护盾吸收、残魂免伤、致死反伤取消剩余连发", () => {
    const a = f("motorcycle", 1),
      b = f("guard", 2, 1),
      c = ctx(a, b);
    b.shield = 150;
    castSkill(c, a, b);
    c.tick = 12;
    advanceAirSkills(c, a);
    expect(c.events[0].absorbed).toBe(100);
    expect(b.hp).toBe(b.maxHp);
    b.immortal = { duration: 16, until: 40, spent: true };
    c.tick = 14;
    advanceAirSkills(c, a);
    expect(c.events[1].immune).toBe(true);
    delete b.immortal;
    b.reflection = 9999;
    c.tick = 16;
    advanceAirSkills(c, a);
    expect(a.hp).toBe(0);
    expect(a.air!.cast).toBeUndefined();
  });
});
describe("摩托骑兵集成", () => {
  it("完整、快速、Worker回放一致，冷却间隔和普攻窗口实际生效", () => {
    const left = [p("motorcycle", 1, 3, 51), p("guard", 2, 3, 35)],
      right = [p("turtle", 3, 3, 35), p("medic", 4, 3, 43)];
    const b = simulate(left, right),
      fast = simulateOutcome(left, right),
      job = compute({ kind: "replay", left, right, version: "metamorph" });
    expect(fast.winner).toBe(b.winner);
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect(fast.damage).toBe(b.damage);
    expect(job.kind === "replay" && job.battle).toEqual(b);
    const casts = b.frames.filter((fr) =>
      fr.effects.some((e) => e.source === 1 && e.kind === "cast"),
    );
    expect(casts.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < casts.length; i++)
      expect(casts[i].tick - casts[i - 1].tick).toBeGreaterThanOrEqual(40);
    expect(
      b.frames
        .flatMap((fr) => fr.events)
        .some((e) => e.attacker === 1 && !e.skill),
    ).toBe(true);
    expect(
      b.frames
        .flatMap((fr) => fr.events)
        .filter((e) => e.attacker === 1 && e.skill).length,
    ).toBeGreaterThanOrEqual(3);
  });
  it("AI把摩托骑兵作为后排，技能装备提高估值且卡池正常", () => {
    const g = createGame(137),
      pl = g.players[0];
    pl.level = 2;
    pl.pieces = [p("motorcycle", 1, 2), p("guard", 2, 2)];
    deployLineup(pl, "standard");
    expect(pl.pieces[0].position).toBeGreaterThanOrEqual(48);
    expect(
      abilityCredit({ ...pl.pieces[0], items: ["staff"] }),
    ).toBeGreaterThan(abilityCredit(pl.pieces[0]));
    expect(g.pool.motorcycle).toBe(COPIES[UNIT.motorcycle.cost]);
  });
  for (const phase of ["prepare", "battle", "result", "finished"] as const)
    it("0.20 " + phase + "仅新增25份卡池，保留资源和逐帧回放", () => {
      const g = createGame(137);
      g.pool.motorcycle = 0;
      let result: ReturnType<typeof startRound> | undefined;
      if (phase !== "prepare") {
        const pl = g.players[0];
        if (pl.shop[0]) g.pool[pl.shop[0]]++;
        pl.shop[0] = phase === "finished" ? "fish" : "guard";
        g.pool[pl.shop[0]]--;
        buy(g, pl, 0);
        pl.pieces[0].position = 35;
        if (phase === "finished") pl.hp = 1;
        result = startRound(g);
        if (phase === "result" || phase === "finished") settle(g, result!);
      }
      expect(g.phase).toBe(phase);
      delete g.pool.motorcycle;
      const before = structuredClone(g),
        decoded = decodeSave(
          JSON.stringify({
            schema: 19,
            rules: "singleplayer-0.20",
            savedAt: 1,
            revision: 1,
            game: g,
            playback: { time: 0, speed: 1, paused: false },
          }),
        );
      expect(decoded.status).toBe("migrated");
      expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
      expect(decoded.data!.game).toEqual({
        ...before,
        pool: { ...before.pool, motorcycle: 25 },
      });
      expect(validGame(decoded.data!.game)).toBe(true);
      if (phase === "battle")
        expect(resumeRound(decoded.data!.game)!.battle).toEqual(result!.battle);
    });
});
