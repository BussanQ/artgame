import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  damage,
  attackInterval,
  type CombatContext,
} from "../src/engine/abilities";
import { advanceSonic, advanceWindup } from "../src/engine/wild-skills";
import { skillReady, usesEnergy } from "../src/engine/triggers";
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
import { COPIES, UNIT, WILD_ADDITIONS } from "../src/data/units";
import type { Fighter, Piece } from "../src/engine/types";
const p = (
  id: string,
  uid: number,
  position: number | null = 35,
  star = 1,
): Piece => ({ defId: id, uid, position, star });
const f = (id: string, uid: number, side: 0 | 1 = 0) => {
  const a = army([p(id, uid)], side)[0];
  Object.assign(a, { x: 3, y: side === 0 ? 4 : 3, shield: 0, mana: 100 });
  return a;
};
const ctx = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 10,
  events: [],
  effects: [],
});
describe("猛禽与陆行者", () => {
  it("猛禽2/3种仅强化本族对地普攻，备战与重复不计，旧版本不启用", () => {
    const pieces = [
      p("bat", 1),
      p("bloodhawk", 2, 36),
      p("bonedragon", 3, 43),
      p("guard", 4, 34),
    ];
    const a = army(pieces, 0);
    expect(a.map((x) => x.groundBonus)).toEqual([0.35, 0.35, 0.35, undefined]);
    expect(army(pieces.slice(0, 2), 0)[0].groundBonus).toBe(0.15);
    expect(
      army([p("bat", 1), p("bat", 2, 36), p("bloodhawk", 3, null)], 0)[0]
        .groundBonus,
    ).toBeUndefined();
    expect(army(pieces, 0, "airsea").every((x) => !x.groundBonus)).toBe(true);
    const target = f("guard", 8, 1);
    target.armor = 0;
    target.hp = target.maxHp = 10000;
    const c = ctx(a[0], target);
    expect(damage(c, a[0], target, 100)).toBe(135);
    target.air!.flying = true;
    expect(damage(c, a[0], target, 100)).toBe(100);
    target.air!.flying = false;
    expect(damage(c, a[0], target, 100, "true", true)).toBe(100);
  });
  it("陆行者真伤普攻仍受护盾、闪避、不朽与反伤约束", () => {
    const a = f("arhat", 1),
      b = f("guard", 2, 1);
    b.armor = 100;
    b.shield = 30;
    b.reflection = 20;
    const c = ctx(a, b);
    expect(a.trueAttack).toBe(true);
    expect(damage(c, a, b, 100)).toBe(70);
    expect(c.events[0].damageType).toBe("true");
    expect(a.hp).toBe(a.maxHp - 20);
    b.air!.flying = true;
    b.air!.evasion = 1;
    expect(damage(c, a, b, 100)).toBe(0);
    expect(c.events.at(-1)!.evaded).toBe(true);
    b.immortal = { duration: 16, until: 26, spent: true };
    b.hp = 1;
    expect(damage(c, a, b, 100)).toBe(0);
    expect(b.hp).toBe(1);
    expect(army([p("arhat", 1)], 0, "airsea")[0].trueAttack).toBeUndefined();
  });
  it("声波伤害冻结，五次脉冲在施法者死后继续，统计归属原施法者", () => {
    const a = f("bat", 1),
      b = f("guard", 2, 1);
    b.magicResist = 0;
    b.hp = b.maxHp = 5000;
    const c = ctx(a, b);
    castSkill(c, a, b);
    expect(c.events).toHaveLength(0);
    expect(b.stunUntil).toBe(15);
    a.attack = 999;
    a.hp = 0;
    for (c.tick = 11; c.tick <= 28; c.tick++) advanceSonic(c);
    expect(c.events.map((e) => e.amount)).toEqual([28, 28, 28, 28, 28]);
    expect(c.events.every((e) => e.periodic && !e.primary && e.skill)).toBe(
      true,
    );
    expect(a.damage).toBe(140);
    expect(b.sonic).toBeUndefined();
  });
  it("同来源声波刷新而不同来源独立，目标死亡后清理", () => {
    const a = f("bat", 1),
      d = f("bat", 3),
      b = f("guard", 2, 1);
    const c = ctx(a, d, b);
    castSkill(c, a, b);
    a.mana = 100;
    c.tick++;
    castSkill(c, a, b);
    castSkill(c, d, b);
    expect(b.sonic).toHaveLength(2);
    expect(b.sonic![0].next).toBe(12);
    b.hp = 0;
    advanceSonic(c);
    expect(b.sonic).toBeUndefined();
  });
  it("金刚仅降低邻近敌人攻速，刷新不叠加且到期恢复", () => {
    const a = f("vajra", 1),
      b = f("guard", 2, 1),
      far = f("guard", 3, 1),
      ally = f("guard", 4);
    far.x = 7;
    const c = ctx(a, b, far, ally);
    castSkill(c, a, b);
    expect(a.shield).toBe(180);
    expect(b.slow?.until).toBe(26);
    expect(attackInterval(b, 10)).toBe(5.6);
    expect(far.slow).toBeUndefined();
    expect(ally.slow).toBeUndefined();
    c.tick = 15;
    a.mana = 100;
    castSkill(c, a, b);
    expect(b.slow?.until).toBe(31);
    expect(attackInterval(b, 15)).toBe(5.6);
    expect(attackInterval(b, 31)).toBe(4);
  });
  it("罗汉等待完整一秒后对锁定目标造成冻结的真伤", () => {
    const a = f("arhat", 1),
      b = f("guard", 2, 1);
    b.armor = 100;
    const c = ctx(a, b);
    castSkill(c, a, b);
    expect(c.events).toHaveLength(0);
    expect(skillReady(a)).toBe(false);
    a.attack = 999;
    for (c.tick = 11; c.tick < 14; c.tick++)
      expect(advanceWindup(c, a)).toBe(true);
    expect(c.events).toHaveLength(0);
    advanceWindup(c, a);
    expect(c.events[0].amount).toBe(180);
    expect(a.windup).toBeUndefined();
  });
  for (const reason of [
    "stun",
    "charm",
    "death",
    "target-dead",
    "target-friendly",
  ] as const)
    it("罗汉蓄力取消或落空：" + reason, () => {
      const a = f("arhat", 1),
        b = f("guard", 2, 1);
      const c = ctx(a, b);
      castSkill(c, a, b);
      if (reason === "stun") a.stunUntil = 20;
      if (reason === "charm")
        a.charm = { side: 0, attack: a.attack, until: 20 };
      if (reason === "death") damage(c, b, a, 9999, "true");
      if (reason === "target-dead") b.hp = 0;
      if (reason === "target-friendly") b.side = 0;
      c.events = [];
      c.tick = 14;
      advanceWindup(c, a);
      expect(c.events).toHaveLength(0);
      expect(a.windup).toBeUndefined();
      expect(a.mana).toBe(reason === "death" ? 10 : 0);
    });
  it("实际控制技能立即中断蓄力，战斗中蓄力期间冷却流逝且不普通攻击", () => {
    const a = f("arhat", 1),
      g = f("guard", 2, 1);
    const c = ctx(a, g);
    castSkill(c, a, g);
    castSkill(c, g, a);
    expect(a.windup).toBeUndefined();
    const battle = simulate(
      [{ ...p("arhat", 1, 35), items: ["staff"] }],
      [p("turtle", 2, 35, 3)],
    );
    const first = battle.frames.findIndex((fr) => fr.fighters[0].windup);
    expect(first).toBeGreaterThan(0);
    const pending = battle.frames[first].fighters[0].windup!;
    for (
      let i = first + 1;
      i < battle.frames.length && battle.frames[i].tick < pending.until;
      i++
    ) {
      expect(
        battle.frames[i].events.some((e) => e.attacker === 1 && !e.skill),
      ).toBe(false);
      expect(battle.frames[i].fighters[0].cooldown).toBeLessThanOrEqual(
        battle.frames[i - 1].fighters[0].cooldown,
      );
    }
  });
  it("吞噬选两格内低于自身当前生命的最健康目标，每战一次且穿盾", () => {
    const a = f("skytoad", 1),
      b = f("guard", 2, 1),
      d = f("guard", 3, 1),
      far = f("guard", 4, 1);
    a.hp = 600;
    b.hp = 200;
    b.shield = 500;
    d.hp = 400;
    d.x = 4;
    d.shield = 500;
    far.x = 7;
    far.hp = 550;
    const c = ctx(a, b, d, far);
    expect(castSkill(c, a, b)).toBe(true);
    expect(d.hp).toBe(0);
    expect(d.shield).toBe(0);
    expect(b.hp).toBe(200);
    expect(usesEnergy(a)).toBe(false);
    a.mana = 100;
    expect(castSkill(c, a, b)).toBe(false);
  });
  it("吞噬无合格目标保留能量，跳过残魂并尊重首次不朽", () => {
    const a = f("skytoad", 1),
      b = f("vine", 2, 1);
    a.hp = b.hp = 500;
    const c = ctx(a, b);
    expect(castSkill(c, a, b)).toBe(false);
    expect(a.mana).toBe(100);
    b.hp = 499;
    b.immortal = { duration: 16, until: 0, spent: false };
    expect(castSkill(c, a, b)).toBe(true);
    expect(b.hp).toBe(1);
    expect(b.immortal.spent).toBe(true);
    const fresh = f("skytoad", 3);
    c.fighters.push(fresh);
    expect(castSkill(c, fresh, b)).toBe(false);
  });
  it("吞噬可以触发殉爆，血鹰吸血仅使用实际生命伤害", () => {
    const a = f("skytoad", 1),
      bug = f("blastbug", 2, 1);
    bug.hp = 100;
    const c = ctx(a, bug);
    castSkill(c, a, bug);
    expect(bug.deathBurst).toBe("spent");
    expect(a.hp).toBeLessThan(a.maxHp);
    const hawk = f("bloodhawk", 3),
      guard = f("guard", 4, 1);
    delete hawk.hawkForm; // Historical fleet skill remains available in old replays.
    hawk.hp = 500;
    guard.shield = 999;
    const d = ctx(hawk, guard);
    castSkill(d, hawk, guard);
    expect(hawk.hp).toBe(500);
    hawk.mana = 100;
    guard.shield = 0;
    guard.hp = 30;
    castSkill(d, hawk, guard);
    expect(hawk.hp).toBe(515);
  });
  it("翔龙仅控制目标一格内敌军并中断蓄力", () => {
    const a = f("winddragon", 1),
      b = f("arhat", 2, 1),
      d = f("guard", 3, 1),
      far = f("guard", 4, 1),
      ally = f("guard", 5);
    d.x = 4;
    far.x = 7;
    const c = ctx(a, b, d, far, ally);
    castSkill(c, b, a);
    castSkill(c, a, b);
    expect(b.windup).toBeUndefined();
    expect(b.stunUntil).toBe(17);
    expect(d.stunUntil).toBe(17);
    expect(far.stunUntil).toBe(0);
    expect(ally.stunUntil).toBe(0);
  });
  it("完整/快速/Worker战斗一致，伤害守恒且无重叠占位", () => {
    const ids = [
      "vajra",
      "bloodhawk",
      "bat",
      "skytoad",
      "arhat",
      "winddragon",
      "bonedragon",
    ];
    const left = ids.map((id, i) =>
      p(id, i + 1, [35, 36, 43, 44, 59, 52, 51][i], 2),
    );
    const right = [
      "treant",
      "vine",
      "bonedragon",
      "thunderlord",
      "stormcaller",
      "acolyte",
    ].map((id, i) => p(id, 100 + i, [35, 36, 43, 44, 51, 52][i], 2));
    const before = structuredClone([left, right]),
      b = simulate(left, right),
      fast = simulateOutcome(left, right);
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect([fast.winner, fast.damage]).toEqual([b.winner, b.damage]);
    const result = compute({
      kind: "replay",
      left,
      right,
      version: "metamorph",
    });
    if (result.kind !== "replay") throw new Error("replay");
    expect(result.battle).toEqual(b);
    expect([left, right]).toEqual(before);
    for (const row of analyzeBattle(b).sides.flatMap((s) => s.fighters))
      expect(row.damage).toBe(
        b.frames.at(-1)!.fighters.find((f) => f.uid === row.uid)!.damage,
      );
    for (const frame of b.frames) {
      const live = frame.fighters.filter((f) => f.hp > 0);
      expect(new Set(live.map((f) => f.x + ":" + f.y)).size).toBe(live.length);
    }
  });
});
describe("0.14 存档增量迁移", () => {
  for (const phase of ["prepare", "battle", "result", "finished"] as const)
    it(phase + "保留阵容与回放并补齐新池", () => {
      const g = createGame(137);
      for (const player of g.players)
        for (let i = 0; i < player.shop.length; i++)
          if (WILD_ADDITIONS.includes(player.shop[i] ?? ""))
            player.shop[i] = null;
      for (const id of WILD_ADDITIONS) g.pool[id] = 0;
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
      for (const id of WILD_ADDITIONS) delete g.pool[id];
      const decoded = decodeSave(
        JSON.stringify({
          schema: 13,
          rules: "singleplayer-0.14",
          savedAt: 1,
          revision: 1,
          game: g,
          playback: { time: 0, speed: 1, paused: false },
        }),
      );
      expect(decoded.status).toBe("migrated");
      expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
      const after = decoded.data!.game;
      expect(validGame(after)).toBe(true);
      expect(after.players).toEqual(before.players);
      expect(after.history).toEqual(before.history);
      expect(after.combatVersion).toBe(before.combatVersion);
      for (const id of WILD_ADDITIONS)
        expect(after.pool[id]).toBe(COPIES[UNIT[id].cost]);
      if (phase === "battle")
        expect(resumeRound(after)!.battle).toEqual(result!.battle);
    });
});
