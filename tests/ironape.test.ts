import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  advanceAirSkills,
  castSkill,
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
import { ironapeChargePose } from "../src/render/melee";
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

describe("铁猿蓄力震爆", () => {
  it("蓄力姿态持续举臂且不提前出现落拳冲击", () => {
    const poses = Array.from({ length: 13 }, (_, i) =>
      ironapeChargePose(i / 12),
    );
    expect(poses.every((p) => p.impact === 0 && p.trail === 0)).toBe(true);
    for (let i = 1; i < poses.length; i++)
      expect(poses[i].lift).toBeGreaterThan(poses[i - 1].lift);
    expect(ironapeChargePose(2)).toEqual(ironapeChargePose(1));
    expect(ironapeChargePose(-1)).toEqual(ironapeChargePose(0));
  });
  it.each([1, 2, 3])("%i星延迟单次爆发，快照技能强度且无控制", (star) => {
    const ape = f("ironape", 1, 0, star),
      target = f("turtle", 2, 1, 3),
      c = ctx(ape, target);
    ape.skillPower = 1.5;
    expect(castSkill(c, ape, target)).toBe(true);
    expect(ape.skillReadyAt).toBe(50);
    expect(ape.mana).toBe(0);
    ape.skillPower = 4;
    ape.attack = 999;
    c.tick = 12;
    expect(advanceAirSkills(c, ape)).toBe(true);
    expect(c.events).toHaveLength(0);
    c.tick = 13;
    advanceAirSkills(c, ape);
    expect(c.events).toHaveLength(1);
    expect(c.events[0]).toMatchObject({
      amount: 375 * 2 ** (star - 1),
      damageType: "magic",
      skill: true,
    });
    expect(target.stunUntil).toBe(0);
    expect(ape.signature!.casts).toBe(1);
    expect(ape.air!.cast).toBeUndefined();
    c.tick = 14;
    expect(advanceAirSkills(c, ape)).toBe(false);
    expect(c.events).toHaveLength(1);
  });
  it("以施法者当前位置重查范围，原目标离开不取消，隐蔽和空中目标仍受范围伤害", () => {
    const ape = f("ironape", 1),
      target = f("guard", 2, 1),
      diagonal = f("guard", 3, 1),
      hidden = f("ghostjet", 4, 1),
      friend = f("guard", 5),
      outside = f("guard", 6, 1),
      dead = f("guard", 7, 1);
    Object.assign(diagonal, { x: 4, y: 3 });
    Object.assign(hidden, { x: 5, y: 4 });
    hidden.air!.phaseUntil = 40;
    Object.assign(outside, { x: 5, y: 3 });
    dead.hp = 0;
    const c = ctx(ape, target, diagonal, hidden, friend, outside, dead);
    expect(castSkill(c, ape, target)).toBe(true);
    target.y = 0;
    c.tick = 13;
    advanceAirSkills(c, ape);
    expect(c.events.map((e) => e.target)).toEqual([3, 4]);
    expect(c.events.every((e) => e.amount === 250)).toBe(true);
    expect(diagonal.stunUntil).toBe(0);
  });
  it("锁定敌人死亡后可命中新进入者，空放只结算一次", () => {
    const ape = f("ironape", 1),
      target = f("guard", 2, 1),
      arrival = f("guard", 3, 1),
      c = ctx(ape, target, arrival);
    arrival.y = 0;
    castSkill(c, ape, target);
    target.hp = 0;
    arrival.y = 2;
    c.tick = 13;
    advanceAirSkills(c, ape);
    expect(c.events.map((e) => e.target)).toEqual([3]);
    c.tick = 50;
    ape.mana = 100;
    arrival.y = 3;
    castSkill(c, ape, arrival);
    arrival.y = 0;
    c.tick = 53;
    advanceAirSkills(c, ape);
    expect(c.effects.filter((e) => e.kind === "pulse")).toHaveLength(2);
    expect(c.events).toHaveLength(1);
    expect(ape.air!.cast).toBeUndefined();
  });
  it.each(["stun", "silence", "charm", "death"] as const)(
    "%s在命中前中断，不退能量或冷却",
    (kind) => {
      const ape = f("ironape", 1),
        target = f("turtle", 2, 1, 3),
        c = ctx(ape, target);
      castSkill(c, ape, target);
      c.tick = 12;
      if (kind === "stun") ape.stunUntil = 20;
      if (kind === "silence") silence(c, target, ape, 8);
      if (kind === "charm")
        ape.charm = { until: 30, side: ape.side, attack: ape.attack };
      if (kind === "death") ape.hp = 0;
      advanceAirSkills(c, ape);
      c.tick = 13;
      advanceAirSkills(c, ape);
      expect(c.events).toHaveLength(0);
      expect(ape.air!.cast).toBeUndefined();
      expect(ape.mana).toBe(0);
      expect(ape.skillReadyAt).toBe(50);
    },
  );
  it("启动要求相邻可见敌人、能量和冷却，失败不消耗资源", () => {
    const ape = f("ironape", 1),
      target = f("turtle", 2, 1, 3),
      c = ctx(ape, target);
    ape.skillReadyAt = 11;
    expect(castSkill(c, ape, target)).toBe(false);
    ape.skillReadyAt = 10;
    ape.stunUntil = 11;
    expect(castSkill(c, ape, target)).toBe(false);
    ape.stunUntil = 0;
    ape.silenceUntil = 11;
    expect(castSkill(c, ape, target)).toBe(false);
    ape.silenceUntil = 0;
    target.air!.phaseUntil = 11;
    expect(castSkill(c, ape, target)).toBe(false);
    target.air!.phaseUntil = 0;
    target.x = 4;
    expect(castSkill(c, ape, target)).toBe(false);
    target.x = 3;
    target.side = 0;
    expect(castSkill(c, ape, target)).toBe(false);
    target.side = 1;
    ape.mana = 99;
    expect(castSkill(c, ape, target)).toBe(false);
    expect(ape.signature!.casts).toBe(0);
    ape.mana = 100;
    expect(castSkill(c, ape, target)).toBe(true);
  });
  it("魔抗与护盾正常结算，不打断敌人引导，不朽目标免伤", () => {
    const ape = f("ironape", 1),
      target = f("motorcycle", 2, 1, 3),
      immune = f("turtle", 3, 1, 3),
      c = ctx(ape, target, immune);
    Object.assign(immune, {
      x: 4,
      y: 4,
      immortal: { duration: 16, until: 100, spent: true },
    });
    target.magicResist = 0.2;
    target.shield = 150;
    castSkill(c, target, ape);
    const pending = target.air!.cast;
    castSkill(c, ape, target);
    c.tick = 13;
    advanceAirSkills(c, ape);
    expect(c.events[0]).toMatchObject({ amount: 50, absorbed: 150 });
    expect(target.air!.cast).toBe(pending);
    expect(target.stunUntil).toBe(0);
    expect(c.events[1].immune).toBe(true);
  });
  it("致死反伤停止同次后续伤害", () => {
    const ape = f("ironape", 1),
      a = f("turtle", 2, 1, 3),
      b = f("guard", 3, 1, 3),
      c = ctx(ape, a, b);
    b.x = 4;
    a.reflection = 9999;
    castSkill(c, ape, a);
    c.tick = 13;
    advanceAirSkills(c, ape);
    expect(ape.hp).toBe(0);
    expect(ape.air!.cast).toBeUndefined();
    expect(
      c.events.filter((e) => e.attacker === 1).map((e) => e.target),
    ).toEqual([2]);
  });
});
describe("铁猿集成与升星护甲", () => {
  it.each([1, 2, 3])(
    "%i星永久护甲在战斗、图鉴和备战保持一致，装备与羁绊另行叠加",
    (star) => {
      const dog = p("ironape", 1, star),
        armor = 6 + (star - 1) * 2;
      expect(unitArmor(UNIT.ironape, star)).toBe(armor);
      expect(army([dog], 0)[0].armor).toBe(armor);
      expect(pieceDetails(dog).armor).toBe(armor);
      const before = { ...codexFilters };
      Object.assign(codexFilters, { query: "铁猿", star });
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
    const left = [p("ironape", 1, 3), p("medic", 2, 2, 43)],
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
  it("正常购买合成得到二星与8护甲，AI前排和技能估值使用新棋子", () => {
    const g = createGame(91, "classic"),
      player = g.players[0];
    for (let i = 0; i < 3; i++) {
      if (player.shop[i]) g.pool[player.shop[i]!]++;
      player.shop[i] = "ironape";
      g.pool.ironape--;
      expect(buy(g, player, i)).toBe(true);
    }
    expect(player.pieces).toHaveLength(1);
    expect(player.pieces[0].star).toBe(2);
    expect(pieceDetails(player.pieces[0]).armor).toBe(8);
    expect(validGame(g)).toBe(true);
    deployLineup(player, "standard");
    expect(player.pieces[0].position).toBeLessThan(40);
    expect(
      abilityCredit({ ...player.pieces[0], items: ["staff"] }),
    ).toBeGreaterThan(abilityCredit(player.pieces[0]));
    expect(pieceStrength(p("ironape", 8, 2))).toBeGreaterThan(
      pieceStrength(p("ironape", 8)),
    );
    expect(
      frontlineFactor([p("ironape", 1), p("infantry", 2), p("sniper", 3)]),
    ).toBeGreaterThan(
      frontlineFactor([p("infantry", 1), p("infantry", 2), p("sniper", 3)]),
    );
  });
  it.each(["prepare", "battle", "result", "finished"] as const)(
    "0.26 %s仅新增30份卡池，原战斗与资源保持",
    (phase) => {
      const g = createGame(137, "classic"),
        me = g.players[0];
      for (const pl of g.players)
        pl.shop = pl.shop.map((id) => {
          if (id !== "ironape") return id;
          g.pool.ironape++;
          g.pool.infantry--;
          return "infantry";
        });
      g.pool.ironape = 0;
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
      delete g.pool.ironape;
      const before = structuredClone(g),
        data = decodeSave(
          JSON.stringify({
            schema: 25,
            rules: "singleplayer-0.26",
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
        pool: { ...before.pool, ironape: COPIES[2] },
      });
      expect(validGame(data.data!.game)).toBe(true);
      if (phase === "battle")
        expect(resumeRound(data.data!.game)!.battle).toEqual(result!.battle);
    },
  );
});
