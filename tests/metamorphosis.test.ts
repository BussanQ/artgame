import { CURRENT_COMBAT_VERSION } from "../src/engine/types";
import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  damage,
  gainMana,
  type CombatContext,
} from "../src/engine/abilities";
import { startHawkCombo, advanceHawkCombo } from "../src/engine/metamorphosis";
import { skillReady, usesEnergy, skillGauge } from "../src/engine/triggers";
import { fighterSprite } from "../src/engine/summons";
import { hawkGroundPose } from "../src/render/metamorph-presentation";
import { REST_POSE } from "../src/render/melee";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { skillDescription, skillName } from "../src/data/skills";
import { compute } from "../src/compute/job";
import {
  createGame,
  buy,
  startRound,
  settle,
  resumeRound,
  nextRound,
} from "../src/engine/game";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { claimReward } from "../src/engine/equipment";
import type { Fighter, Piece } from "../src/engine/types";
const p = (defId: string, uid: number, position = 35, star = 1): Piece => ({
  defId,
  uid,
  position,
  star,
});
const f = (id: string, uid: number, side: 0 | 1 = 0) => {
  const a = army([p(id, uid)], side)[0];
  Object.assign(a, { x: 3, y: side ? 3 : 4, mana: 100, shield: 0 });
  return a;
};
const ctx = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 10,
  events: [],
  effects: [],
});
describe("血鹰持续变身", () => {
  it("一次回血落地，保持身份、占位、羁绊与装备；停止回能", () => {
    const a = f("bloodhawk", 1),
      b = f("guard", 2, 1);
    a.hp = 100;
    a.skillPower = 5;
    a.groundBonus = 0.35;
    a.air!.evasion = 0.45;
    a.air!.seaMana = 20;
    const c = ctx(a, b);
    const before = { uid: a.uid, x: a.x, y: a.y, attack: a.attack };
    expect(castSkill(c, a, b)).toBe(true);
    expect(a).toMatchObject(before);
    expect(a.hp).toBe(a.maxHp);
    expect(a.healing).toBe(800);
    expect(a.air).toMatchObject({ flying: false, evasion: 0, seaMana: 0 });
    expect(a.groundBonus).toBe(0.35);
    expect(c.events).toHaveLength(0);
    expect(a.hawkForm?.active).toBe(true);
    expect(skillReady(a)).toBe(false);
    expect(usesEnergy(a)).toBe(false);
    gainMana(a, 100, 10);
    expect(a.mana).toBe(0);
    expect(skillGauge(a).progress).toBe(0);
    a.hp = 200;
    a.mana = 100;
    expect(castSkill(c, a, b)).toBe(false);
    expect(a.hp).toBe(200);
  });
  it("空中和落地后的对空克制、对地加成与闪避按当前形态计算", () => {
    const a = f("bloodhawk", 1),
      cannon = f("cannon", 2, 1),
      raptor = f("bat", 3, 1);
    a.armor = 0;
    a.hp = a.maxHp = 5000;
    raptor.groundBonus = 0.35;
    const c = ctx(a, cannon, raptor);
    expect(damage(c, cannon, a, 100)).toBe(150);
    expect(damage(c, raptor, a, 100)).toBe(100);
    a.mana = 100;
    castSkill(c, a, cannon);
    expect(damage(c, cannon, a, 100)).toBe(100);
    expect(damage(c, raptor, a, 100)).toBe(135);
  });
  it("三段为普通攻击，逐次吸血反伤，伤害、破盾与动画顺序真实对应", () => {
    const a = f("bloodhawk", 1),
      b = f("guard", 2, 1);
    const c = ctx(a, b);
    castSkill(c, a, b);
    c.events = [];
    a.attack = 100;
    a.hp = 500;
    a.lifesteal = 0.5;
    b.armor = 0;
    b.shield = 50;
    b.reflection = 20;
    expect(startHawkCombo(c, a, b)).toBe(true);
    c.tick++;
    advanceHawkCombo(c, a);
    c.tick++;
    advanceHawkCombo(c, a);
    const hits = c.events.filter((e) => !e.reflected);
    expect(hits.map((e) => e.amount)).toEqual([10, 60, 60]);
    expect(hits.map((e) => e.strike)).toEqual([1, 2, 3]);
    expect(hits.every((e) => !e.skill && e.primary)).toBe(true);
    expect(c.events.filter((e) => e.reflected)).toHaveLength(3);
    expect(a.combo).toBeUndefined();
    expect(a.damage).toBe(130);
    expect(a.hp).toBe(505);
  });
  it("每段可独立闪避；反伤击杀施法者立即取消后段，不复活", () => {
    const a = f("bloodhawk", 1),
      b = f("repair", 2, 1),
      c = ctx(a, b);
    castSkill(c, a, b);
    b.air!.evasion = 1;
    startHawkCombo(c, a, b);
    c.tick++;
    advanceHawkCombo(c, a);
    c.tick++;
    advanceHawkCombo(c, a);
    expect(c.events).toHaveLength(3);
    expect(c.events.every((e) => e.evaded)).toBe(true);
    b.air!.evasion = 0;
    b.reflection = 100;
    a.hp = 1;
    startHawkCombo(c, a, b);
    expect(a.hp).toBe(0);
    expect(a.combo).toBeUndefined();
    a.mana = 100;
    expect(castSkill(c, a, b)).toBe(false);
  });
  for (const reason of [
    "stun",
    "charm",
    "dead",
    "range",
    "friendly",
    "concealed",
  ] as const)
    it("取消余下连击：" + reason, () => {
      const a = f("bloodhawk", 1),
        b = f("guard", 2, 1),
        c = ctx(a, b);
      castSkill(c, a, b);
      startHawkCombo(c, a, b);
      const count = c.events.length;
      if (reason === "stun") a.stunUntil = 20;
      if (reason === "charm")
        a.charm = { side: 0, attack: a.attack, until: 20 };
      if (reason === "dead") b.hp = 0;
      if (reason === "range") b.y = 0;
      if (reason === "friendly") b.side = 0;
      if (reason === "concealed") b.air!.phaseUntil = 20;
      c.tick++;
      expect(advanceHawkCombo(c, a)).toBe(true);
      expect(c.events).toHaveLength(count);
      expect(a.combo).toBeUndefined();
      expect(a.hawkForm?.active).toBe(true);
    });
  it("眩晕技能即时打断但不撤销形态", () => {
    const a = f("bloodhawk", 1),
      b = f("guard", 2, 1),
      c = ctx(a, b);
    castSkill(c, a, b);
    startHawkCombo(c, a, b);
    castSkill(c, b, a);
    expect(a.combo).toBeUndefined();
    expect(a.hawkForm?.active).toBe(true);
    expect(a.air!.flying).toBe(false);
  });
  it("旧 fleet 仍为突袭回血，当前名称、图鉴和形态图正确区分", () => {
    const old = army([p("bloodhawk", 1)], 0, "fleet")[0],
      b = f("guard", 2, 1);
    old.hp = 500;
    old.mana = 100;
    b.armor = 0;
    const c = ctx(old, b);
    castSkill(c, old, b);
    expect(old.hawkForm).toBeUndefined();
    expect(old.air!.flying).toBe(true);
    expect(old.hp).toBe(572);
    expect(c.events[0]).toMatchObject({ amount: 144, skill: true });
    expect(c.effects.find((e) => e.kind === "cast")!.name).toBe("血羽突袭");
    expect(skillName("bloodhawk", "fleet")).toBe("血羽突袭");
    expect(skillName("bloodhawk")).toBe("血羽化身");
    expect(skillDescription("bloodhawk")).toContain("三段");
    const a = f("bloodhawk", 3);
    expect(fighterSprite(a)).toBe("bloodhawk");
    castSkill(ctx(a, b), a, b);
    expect(fighterSprite(a)).toBe("bloodhawk-ground");
    expect(hawkGroundPose(0)).toEqual(REST_POSE);
    expect(hawkGroundPose(1)).toEqual(REST_POSE);
    expect(hawkGroundPose(0.5, 1).rotation).toBe(
      -hawkGroundPose(0.5, 2).rotation,
    );
  });
  it("完整、快速和 Worker 一致，连击冷却流逝，统计和占位守恒", () => {
    const left = [
      { ...p("bloodhawk", 1, 35, 2), items: ["staff"] },
      p("bat", 2, 43, 2),
      p("lion", 3, 36, 2),
    ];
    const right = [
      p("turtle", 101, 35, 2),
      p("vajra", 102, 36, 2),
      p("arhat", 103, 43, 2),
    ];
    const input = structuredClone([left, right]);
    const b = simulate(left, right),
      fast = simulateOutcome(left, right),
      worker = compute({
        kind: "replay",
        left,
        right,
        version: CURRENT_COMBAT_VERSION,
      });
    expect(worker.kind).toBe("replay");
    if (worker.kind !== "replay") return;
    expect(JSON.stringify(worker.battle)).toBe(JSON.stringify(b));
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect([fast.winner, fast.damage]).toEqual([b.winner, b.damage]);
    expect([left, right]).toEqual(input);
    expect(b.frames.some((fr) => fr.events.some((e) => e.strike === 3))).toBe(
      true,
    );
    for (let i = 1; i < b.frames.length; i++) {
      const prev = b.frames[i - 1].fighters[0],
        now = b.frames[i].fighters[0];
      if (prev.combo && now.hp > 0)
        expect(now.cooldown).toBeLessThanOrEqual(prev.cooldown);
      const live = b.frames[i].fighters.filter((f) => f.hp > 0);
      expect(new Set(live.map((f) => f.x + ":" + f.y)).size).toBe(live.length);
    }
    for (const row of analyzeBattle(b).sides.flatMap((s) => s.fighters))
      expect(row.damage).toBe(
        b.frames.at(-1)!.fighters.find((f) => f.uid === row.uid)!.damage,
      );
  });
});
describe("0.15 战斗版本迁移", () => {
  for (const phase of ["prepare", "battle", "result", "finished"] as const)
    it(phase + "仅在准备或下一轮切换规则", () => {
      const g = createGame(137, "classic");
      g.combatVersion = "fleet";
      let result: ReturnType<typeof startRound>;
      if (phase !== "prepare") {
        const me = g.players[0];
        if (me.shop[0]) g.pool[me.shop[0]]++;
        me.shop[0] = phase === "finished" ? "fish" : "bloodhawk";
        g.pool[me.shop[0]]--;
        expect(buy(g, me, 0)).toBe(true);
        me.pieces[0].position = 35;
        if (phase === "finished") me.hp = 1;
        result = startRound(g);
        if (phase === "result" || phase === "finished") settle(g, result!);
      }
      expect(g.phase).toBe(phase);
      const before = structuredClone(g);
      const d = decodeSave(
        JSON.stringify({
          schema: 14,
          rules: "singleplayer-0.15",
          savedAt: 1,
          revision: 1,
          game: g,
          playback: { time: 0, speed: 1, paused: false },
        }),
      );
      expect(d.status).toBe("migrated");
      expect(d.data!.schema).toBe(SAVE_SCHEMA);
      const after = d.data!.game;
      expect(validGame(after)).toBe(true);
      expect(after).toEqual({
        ...before,
        combatVersion: phase === "prepare" ? CURRENT_COMBAT_VERSION : "fleet",
      });
      if (phase === "battle")
        expect(JSON.stringify(resumeRound(after)!.battle)).toBe(
          JSON.stringify(result!.battle),
        );
      if (phase === "result") {
        if (after.reward) claimReward(after, 0);
        nextRound(after);
        expect(after.combatVersion).toBe(CURRENT_COMBAT_VERSION);
        expect(after.history[0].combatVersion).toBe("fleet");
      }
    });
});
