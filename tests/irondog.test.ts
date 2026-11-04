import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  advanceAirSkills,
  castSkill,
  damage,
  type CombatContext,
} from "../src/engine/abilities";
import { unitArmor } from "../src/data/unit-stats";
import { UNIT, COPIES, RULES } from "../src/data/units";
import { pieceDetails } from "../src/ui/bench-tooltip";
import { codexCards, codexFilters } from "../src/ui/unit-codex";
import {
  abilityCredit,
  deployLineup,
  frontlineFactor,
  pieceStrength,
} from "../src/engine/ai";
import {
  CURRENT_COMBAT_VERSION,
  type Fighter,
  type Piece,
} from "../src/engine/types";
import { compute } from "../src/compute/job";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import {
  buy,
  createGame,
  startRound,
  settle,
  resumeRound,
} from "../src/engine/game";
import { silence } from "../src/engine/infantry-skills";
const p = (
  defId: string,
  uid: number,
  star = 1,
  position: number | null = 35,
): Piece => ({ defId, uid, star, position });
const f = (defId: string, uid: number, side: 0 | 1 = 0, star = 1) =>
  Object.assign(army([p(defId, uid, star)], side)[0], {
    x: 3,
    y: side === 0 ? 4 : 3,
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

describe("铁狗分段震荡", () => {
  it.each([1, 2, 3])(
    "%i星三次独立震荡，伤害在施法时快照，每次短眩晕间留空档",
    (star) => {
      const dog = f("irondog", 1, 0, star),
        target = f("turtle", 2, 1, 3),
        c = ctx(dog, target);
      dog.skillPower = 1.5;
      expect(castSkill(c, dog, target)).toBe(true);
      dog.skillPower = 3;
      dog.attack = 999;
      expect(dog.skillReadyAt).toBe(50);
      expect(dog.mana).toBe(0);
      const ticks: number[] = [];
      for (c.tick = 11; c.tick <= 18; c.tick++) {
        const before = c.events.length;
        advanceAirSkills(c, dog);
        if (c.events.length > before) {
          ticks.push(c.tick);
          expect(target.stunUntil).toBe(c.tick + 2);
        }
        if (c.tick === 14 || c.tick === 17)
          expect(target.stunUntil).toBeLessThanOrEqual(c.tick);
      }
      expect(ticks).toEqual([12, 15, 18]);
      expect(c.events.map((e) => e.amount)).toEqual(
        Array(3).fill(105 * 2 ** (star - 1)),
      );
      expect(c.effects.filter((e) => e.kind === "pulse")).toHaveLength(3);
      expect(dog.signature!.casts).toBe(1);
      expect(dog.air!.cast).toBeUndefined();
    },
  );
  it("每次按当前相邻敌人重新判定，飞行/隐蔽可被范围命中，友军/范围外/阵亡不命中", () => {
    const dog = f("irondog", 1),
      target = f("infantry", 2, 1),
      flying = f("ghostjet", 3, 1),
      friend = f("guard", 4),
      outside = f("guard", 5, 1),
      dead = f("guard", 6, 1);
    Object.assign(flying, { x: 4, y: 4 });
    flying.air!.phaseUntil = 40;
    Object.assign(friend, { x: 2, y: 4 });
    Object.assign(outside, { x: 4, y: 3 });
    dead.hp = 0;
    target.hp = 1;
    const c = ctx(dog, target, flying, friend, outside, dead);
    expect(castSkill(c, dog, target)).toBe(true);
    c.tick = 12;
    advanceAirSkills(c, dog);
    expect(c.events.map((e) => e.target)).toEqual([2, 3]);
    flying.x = 7;
    Object.assign(outside, { x: 3, y: 3 });
    c.tick = 15;
    advanceAirSkills(c, dog);
    expect(c.events.slice(2).map((e) => e.target)).toEqual([5]);
    outside.y = 1;
    c.tick = 18;
    advanceAirSkills(c, dog);
    expect(c.events).toHaveLength(3);
    expect(c.effects.filter((e) => e.kind === "pulse")).toHaveLength(3);
    expect(dog.air!.cast).toBeUndefined();
  });
  it.each(["stun", "silence", "charm", "death"] as const)(
    "%s立即中断剩余震荡，冷却和耗能不退还",
    (kind) => {
      const dog = f("irondog", 1),
        target = f("turtle", 2, 1, 3),
        c = ctx(dog, target);
      castSkill(c, dog, target);
      c.tick = 12;
      advanceAirSkills(c, dog);
      c.tick = 13;
      if (kind === "stun") dog.stunUntil = 25;
      if (kind === "silence") silence(c, target, dog, 8);
      if (kind === "charm")
        dog.charm = { until: 30, attack: dog.attack, side: dog.side };
      if (kind === "death") dog.hp = 0;
      advanceAirSkills(c, dog);
      c.tick = 18;
      advanceAirSkills(c, dog);
      expect(c.events).toHaveLength(1);
      expect(dog.air!.cast).toBeUndefined();
      expect(dog.skillReadyAt).toBe(50);
      expect(dog.mana).toBe(0);
    },
  );
  it("冷却、眩晕、隐蔽、距离和阵营阻止开始施法且保留能量", () => {
    const dog = f("irondog", 1),
      target = f("turtle", 2, 1, 3),
      c = ctx(dog, target);
    dog.skillReadyAt = 11;
    expect(castSkill(c, dog, target)).toBe(false);
    dog.skillReadyAt = 10;
    dog.stunUntil = 11;
    expect(castSkill(c, dog, target)).toBe(false);
    dog.stunUntil = 0;
    target.air!.phaseUntil = 20;
    expect(castSkill(c, dog, target)).toBe(false);
    target.air!.phaseUntil = 0;
    target.x = 7;
    expect(castSkill(c, dog, target)).toBe(false);
    target.x = 3;
    target.side = 0;
    expect(castSkill(c, dog, target)).toBe(false);
    expect(dog.mana).toBe(100);
    expect(dog.signature!.casts).toBe(0);
    target.side = 1;
    expect(castSkill(c, dog, target)).toBe(true);
  });
  it("护盾逐段承伤，不朽免伤；致死反伤停止同次后续目标与后续震荡", () => {
    const dog = f("irondog", 1),
      a = f("turtle", 2, 1, 3),
      b = f("guard", 3, 1, 3),
      c = ctx(dog, a, b);
    Object.assign(b, { x: 4, y: 4 });
    a.shield = 100;
    castSkill(c, dog, a);
    c.tick = 12;
    advanceAirSkills(c, dog);
    expect(c.events[0]).toMatchObject({ amount: 0, absorbed: 70 });
    a.immortal = { duration: 16, until: 100, spent: true };
    c.tick = 15;
    advanceAirSkills(c, dog);
    expect(c.events[2].immune).toBe(true);
    expect(a.stunUntil).toBe(14);
    delete a.immortal;
    a.shield = 0;
    a.reflection = 9999;
    c.tick = 18;
    const before = c.events.length;
    advanceAirSkills(c, dog);
    expect(dog.hp).toBe(0);
    expect(dog.air!.cast).toBeUndefined();
    expect(
      c.events
        .slice(before)
        .filter((e) => e.attacker === dog.uid)
        .map((e) => e.target),
    ).toEqual([a.uid]);
  });
  it("受震荡眩晕立即打断敌方引导", () => {
    const dog = f("irondog", 1),
      rider = f("motorcycle", 2, 1),
      c = ctx(dog, rider);
    expect(castSkill(c, rider, dog)).toBe(true);
    expect(castSkill(c, dog, rider)).toBe(true);
    c.tick = 12;
    advanceAirSkills(c, dog);
    expect(rider.air!.cast).toBeUndefined();
    expect(rider.stunUntil).toBe(14);
  });
});

describe("铁狗集成与升星护甲", () => {
  it.each([1, 2, 3])(
    "%i星永久护甲在战斗、图鉴和备战保持一致，装备与羁绊另行叠加",
    (star) => {
      const dog = p("irondog", 1, star),
        armor = 5 + (star - 1) * 2;
      expect(unitArmor(UNIT.irondog, star)).toBe(armor);
      expect(army([dog], 0)[0].armor).toBe(armor);
      expect(pieceDetails(dog).armor).toBe(armor);
      const before = { ...codexFilters };
      Object.assign(codexFilters, { query: "铁狗", star });
      try {
        expect(codexCards()).toContain(`护甲 ${armor}`);
      } finally {
        Object.assign(codexFilters, before);
      }
      const equipped = { ...dog, items: ["plate"] };
      expect(pieceDetails(equipped).armor).toBe(armor + 3);
      expect(army([equipped, p("chariot", 2)], 0, "infantry")[0].armor).toBe(
        armor + 6,
      );
      expect(unitArmor(UNIT.guard, star)).toBe(UNIT.guard.armor);
    },
  );
  it("完整、快速、Worker一致，冷却期间普攻，输入不变", () => {
    const left = [p("irondog", 1, 3), p("medic", 2, 2, 43)],
      right = [p("turtle", 101, 3), p("medic", 102, 3, 43)];
    const before = structuredClone([left, right]),
      battle = simulate(left, right),
      fast = simulateOutcome(left, right);
    expect(
      compute({ kind: "replay", left, right, version: CURRENT_COMBAT_VERSION }),
    ).toEqual({ kind: "replay", battle });
    expect(fast.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
    expect([fast.winner, fast.damage]).toEqual([battle.winner, battle.damage]);
    expect([left, right]).toEqual(before);
    const casts = battle.frames.filter((fr) =>
      fr.effects.some((e) => e.source === 1 && e.kind === "cast"),
    );
    expect(casts.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < casts.length; i++)
      expect(casts[i].tick - casts[i - 1].tick).toBeGreaterThanOrEqual(40);
    expect(
      battle.frames
        .flatMap((fr) => fr.events)
        .some((e) => e.attacker === 1 && !e.skill),
    ).toBe(true);
    for (const frame of battle.frames) {
      const live = frame.fighters.filter((f) => f.hp > 0);
      expect(new Set(live.map((f) => `${f.x},${f.y}`)).size).toBe(live.length);
    }
  });
  it("正常购买合成得到二星与7护甲，AI前排和技能估值使用新棋子", () => {
    const g = createGame(91, "classic"),
      player = g.players[0];
    for (let i = 0; i < 3; i++) {
      if (player.shop[i]) g.pool[player.shop[i]!]++;
      player.shop[i] = "irondog";
      g.pool.irondog--;
      expect(buy(g, player, i)).toBe(true);
    }
    expect(player.pieces).toHaveLength(1);
    expect(player.pieces[0].star).toBe(2);
    expect(pieceDetails(player.pieces[0]).armor).toBe(7);
    expect(validGame(g)).toBe(true);
    deployLineup(player, "standard");
    expect(player.pieces[0].position).toBeLessThan(40);
    expect(
      abilityCredit({ ...player.pieces[0], items: ["staff"] }),
    ).toBeGreaterThan(abilityCredit(player.pieces[0]));
    expect(pieceStrength(p("irondog", 8, 2))).toBeGreaterThan(
      pieceStrength(p("irondog", 8)),
    );
    expect(
      frontlineFactor([p("irondog", 1), p("infantry", 2), p("sniper", 3)]),
    ).toBeGreaterThan(
      frontlineFactor([p("infantry", 1), p("infantry", 2), p("sniper", 3)]),
    );
  });
  it.each(["prepare", "battle", "result", "finished"] as const)(
    "0.23 %s仅新增45份卡池，原战斗与资源保持",
    (phase) => {
      const g = createGame(137, "classic"),
        me = g.players[0];
      for (const pl of g.players)
        pl.shop = pl.shop.map((id) => {
          if (id !== "irondog") return id;
          g.pool.irondog++;
          g.pool.infantry--;
          return "infantry";
        });
      g.pool.irondog = 0;
      let result: ReturnType<typeof startRound> = null;
      if (phase !== "prepare") {
        if (me.shop[0]) g.pool[me.shop[0]!]++;
        me.shop[0] = phase === "finished" ? "fish" : "guard";
        g.pool[me.shop[0]]--;
        expect(buy(g, me, 0)).toBe(true);
        me.pieces[0].position = 35;
        if (phase === "finished") me.hp = 1;
        result = startRound(g);
        if (phase === "result" || phase === "finished") settle(g, result!);
      }
      expect(g.phase).toBe(phase);
      delete g.pool.irondog;
      const before = structuredClone(g),
        data = decodeSave(
          JSON.stringify({
            schema: 22,
            rules: "singleplayer-0.23",
            savedAt: 1,
            revision: 1,
            game: g,
            playback: { time: 3, speed: 2, paused: true },
          }),
        );
      expect(data.status).toBe("migrated");
      expect(data.data).toMatchObject({
        schema: SAVE_SCHEMA,
        rules: RULES.version,
        playback: { time: 3, speed: 2, paused: true },
      });
      expect(data.data!.game).toEqual({
        ...before,
        pool: { ...before.pool, irondog: COPIES[1] },
      });
      expect(validGame(data.data!.game)).toBe(true);
      if (phase === "battle")
        expect(resumeRound(data.data!.game)!.battle).toEqual(result!.battle);
    },
  );
});
