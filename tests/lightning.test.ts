import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { lightningStrike } from "../src/engine/lightning";
import {
  castSkill,
  damage,
  gainMana,
  type CombatContext,
} from "../src/engine/abilities";
import { usesEnergy, skillReady } from "../src/engine/triggers";
import { abilityCredit } from "../src/engine/ai";
import { itemScore, claimReward } from "../src/engine/equipment";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { compute } from "../src/compute/job";
import {
  createGame,
  buy,
  move,
  startRound,
  settle,
  nextRound,
  resumeRound,
  sell,
} from "../src/engine/game";
import { unitCost } from "../src/data/catalog";
import { unitDefinition } from "../src/data/unit-stats";
import { UNIT, COPIES } from "../src/data/units";
import { skillName, skillDescription } from "../src/data/skills";
import {
  CURRENT_COMBAT_VERSION,
  type Piece,
  type Fighter,
} from "../src/engine/types";
import { validGame, decodeSave, SAVE_SCHEMA } from "../src/engine/persistence";
import { pieceCopies } from "../src/engine/progression";
import { LIGHTNING_DEMO } from "../src/data/lightning-demo";
import frozen from "./fixtures/pre-v051-replays.json";
const p = (
  defId: string,
  uid: number,
  star = 1,
  position: number | null = 35,
): Piece => ({ defId, uid, star, position });
const f = (defId: string, uid: number, side: 0 | 1 = 0, star = 1): Fighter =>
  Object.assign(army([p(defId, uid, star)], side)[0], {
    x: 3,
    y: side ? 4 : 5,
    hp: 10000,
    maxHp: 10000,
    shield: 0,
    armor: 0,
    regeneration: 0,
    magicResist: 0,
  });
const ctx = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 10,
  events: [],
  effects: [],
});

describe("雷神锁链物理普攻", () => {
  for (const star of [1, 2, 3])
    it(`${star}星在两个活目标间往返且总命中有上限`, () => {
      const a = f("thunderlord", 1, 0, star),
        b = f("guard", 2, 1),
        c = f("guard", 3, 1);
      a.attack = 128;
      c.x = 4;
      const state = ctx(a, c, b);
      expect(lightningStrike(state, a, b)).toBe(true);
      expect(state.events.map((e) => e.target)).toEqual(
        Array.from({ length: 1 + star * 2 }, (_, i) => (i % 2 ? 3 : 2)),
      );
      expect(state.events.map((e) => e.amount)).toEqual(
        [128, 64, 32, 16, 8, 4, 2].slice(0, 1 + star * 2),
      );
      expect(state.events.filter((e) => e.primary)).toHaveLength(1);
      expect(
        state.events.every((e) => !e.skill && e.damageType === "physical"),
      ).toBe(true);
      expect(a.signature!.casts).toBe(0);
    });
  it("单独目标不原地反复命中，半径外不接雷，等距按UID", () => {
    const a = f("thunderlord", 1),
      b = f("guard", 2, 1),
      c = f("guard", 3, 1),
      d = f("guard", 4, 1);
    Object.assign(c, { x: 7, y: 0 });
    Object.assign(d, { x: 6, y: 0 });
    let state = ctx(a, b, c, d);
    lightningStrike(state, a, b);
    expect(state.events).toHaveLength(1);
    Object.assign(c, { x: 2, y: 4 });
    Object.assign(d, { x: 4, y: 4 });
    state = ctx(a, d, c, b);
    lightningStrike(state, a, b);
    expect(state.events[1].target).toBe(3);
  });
  it("隐蔽敌人与友军不参与链路，首击目标死后继续从死亡位置弹射", () => {
    const a = f("thunderlord", 1),
      b = f("guard", 2, 1),
      hidden = f("fish", 3, 1),
      guard = f("guard", 4, 1),
      ally = f("guard", 5);
    Object.assign(hidden, { x: 4, y: 4 });
    Object.assign(guard, { x: 4, y: 3 });
    b.hp = 1;
    const state = ctx(a, b, hidden, guard, ally);
    lightningStrike(state, a, b);
    expect(state.events.map((e) => e.target)).toEqual([2, 4]);
    expect(state.events[1].from).toEqual({ x: 3, y: 4 });
    expect(hidden.hp).toBe(10000);
    expect(ally.hp).toBe(10000);
  });
  it("穿透与吸血逐跳结算，护盾不算吸血，技能强度不放大", () => {
    const a = f("thunderlord", 1),
      b = f("guard", 2, 1),
      c = f("guard", 3, 1);
    c.x = 4;
    Object.assign(a, {
      attack: 100,
      skillPower: 9,
      lifesteal: 0.5,
      hp: 9000,
      armorPenetration: 5,
    });
    Object.assign(b, { armor: 5, shield: 100 });
    c.armor = 5;
    const state = ctx(a, b, c);
    lightningStrike(state, a, b);
    expect(state.events.map((e) => e.amount)).toEqual([0, 50, 25]);
    expect(state.events[0].absorbed).toBe(100);
    expect(a.healing).toBe(38);
    expect(a.hp).toBe(9038);
    expect(b.mana).toBe(20);
    expect(c.mana).toBe(10);
  });
  it("沉默不阻止普攻被动；眩晕、友军首击、超射程和死亡阻止攻击", () => {
    const a = f("thunderlord", 1),
      b = f("guard", 2, 1);
    a.silenceUntil = 99;
    let state = ctx(a, b);
    lightningStrike(state, a, b);
    expect(state.events).toHaveLength(1);
    for (const patch of [
      { stunUntil: 11 },
      { hp: 0 },
      { x: 7, y: 7 },
      { side: 1 as const },
    ]) {
      const s = Object.assign(f("thunderlord", 1), patch);
      state = ctx(s, b);
      lightningStrike(state, s, b);
      expect(state.events).toHaveLength(0);
    }
  });
  it("首击闪避中止弹射，后续闪避仍可继续传导", () => {
    const a = f("thunderlord", 1),
      b = f("guard", 2, 1),
      c = f("guard", 3, 1);
    c.x = 4;
    b.air!.flying = true;
    b.air!.evasion = 1;
    let state = ctx(a, b, c);
    lightningStrike(state, a, b);
    expect(state.events).toHaveLength(1);
    expect(state.events[0].evaded).toBe(true);
    b.air!.evasion = 0;
    c.air!.flying = true;
    c.air!.evasion = 1;
    state = ctx(a, b, c);
    lightningStrike(state, a, b);
    expect(state.events).toHaveLength(3);
    expect(state.events[1].evaded).toBe(true);
    expect(state.events[2].target).toBe(2);
  });
  it("灵能反伤击杀攻击者后不再跳跃", () => {
    const a = f("thunderlord", 1),
      b = f("guard", 2, 1),
      c = f("guard", 3, 1);
    c.x = 4;
    a.hp = 20;
    b.reflection = 30;
    const state = ctx(a, b, c);
    lightningStrike(state, a, b);
    expect(a.hp).toBe(0);
    expect(state.events.filter((e) => e.attacker === 1)).toHaveLength(1);
    expect(c.hp).toBe(10000);
  });
  it("残魂和狂舞仍按普通攻击承受，后续不是技能伤害", () => {
    const a = f("thunderlord", 1),
      b = f("guard", 2, 1),
      c = f("swordthrall", 3, 1);
    c.x = 4;
    b.immortal = { spent: true, until: 30, duration: 20 };
    c.bladeStorm = { remaining: 3, next: 12, until: 30, damage: 10 };
    const state = ctx(a, b, c);
    lightningStrike(state, a, b);
    expect(state.events[0].immune).toBe(true);
    expect(state.events[1].amount).toBeGreaterThan(0);
  });
  it("新被动不收能量或施法，不接受童子充能", () => {
    const a = f("thunderlord", 1),
      b = f("guard", 2, 1),
      support = f("acolyte", 3);
    a.mana = 0;
    support.mana = 100;
    const state = ctx(a, b, support);
    gainMana(a, 50, 10);
    damage(state, b, a, 10);
    expect(a.mana).toBe(0);
    expect(usesEnergy(a)).toBe(false);
    a.mana = 100;
    expect(skillReady(a)).toBe(false);
    expect(castSkill(state, a, b)).toBe(false);
    expect(castSkill(state, support, b)).toBe(false);
  });
  it("AI偏好攻击、攻速与吸血，不给法强和回能虚构收益", () => {
    const u = p("thunderlord", 1, 2);
    expect(abilityCredit({ ...u, items: ["staff", "crystal"] })).toBe(
      abilityCredit(u),
    );
    expect(itemScore(u, "staff")).toBe(0);
    expect(itemScore(u, "crystal")).toBe(0);
    expect(itemScore(u, "coil")).toBeGreaterThan(0);
    expect(itemScore(u, "fang")).toBeGreaterThan(0);
    expect(itemScore(u, "staff", "tar")).toBeGreaterThan(0);
  });
  it("分星、快速与Worker结果一致，统计只看已播放的弹射", () => {
    const before = structuredClone(LIGHTNING_DEMO),
      b = simulate(before.left, before.right);
    const fast = simulateOutcome(before.left, before.right);
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect(fast.winner).toBe(b.winner);
    expect(
      compute({ kind: "replay", ...before, version: CURRENT_COMBAT_VERSION }),
    ).toEqual({ kind: "replay", battle: b });
    expect(LIGHTNING_DEMO).toEqual(before);
    const all = analyzeBattle(b),
      first = b.frames.findIndex((fr) =>
        fr.events.some((e) => e.chainHop === 0),
      );
    const row = all.sides[0].fighters.find((f) => f.uid === 101)!;
    expect(row.lightning!.bounces).toBeGreaterThan(0);
    expect(row.skillDamage).toBe(0);
    expect(row.casts).toBe(0);
    expect(
      analyzeBattle(b, first).sides[0].fighters.find((f) => f.uid === 101)!
        .lightning!.attacks,
    ).toBe(1);
    expect(
      b.frames
        .at(-1)!
        .fighters.filter((f) => f.lightningChain)
        .every((f) => f.mana === 0),
    ).toBe(true);
  });
});

describe("雷震子目录与旧局兼容", () => {
  for (const catalog of ["tar", CURRENT_COMBAT_VERSION] as const)
    it(`${catalog}按本局费用购买、升星和出售，实际份数守恒`, () => {
      const g = createGame(137, "classic"),
        player = g.players[0];
      for (const pl of g.players) pl.shop.fill(null);
      g.catalogVersion = catalog;
      g.pool = Object.fromEntries(
        Object.keys(UNIT).map((id) => [id, COPIES[unitCost(id, catalog)]]),
      );
      const cost = unitCost("thunderlord", catalog),
        cap = COPIES[cost];
      player.gold = cost * 3;
      for (let i = 0; i < 3; i++) {
        player.shop[0] = "thunderlord";
        g.pool.thunderlord--;
        expect(buy(g, player, 0)).toBe(true);
      }
      expect(player.gold).toBe(0);
      expect(player.pieces).toHaveLength(1);
      expect(player.pieces[0]).toMatchObject({ defId: "thunderlord", star: 2 });
      expect(pieceCopies(player.pieces[0])).toBe(3);
      expect(g.pool.thunderlord).toBe(cap - 3);
      expect(sell(g, player, player.pieces[0].uid)).toBe(true);
      expect(player.gold).toBe(cost * 3);
      expect(g.pool.thunderlord).toBe(cap);
      expect(validGame(g)).toBe(true);
    });
  it("新局三费25份，旧局保留五费10份和旧职业/技能/身板", () => {
    expect(unitCost("thunderlord")).toBe(3);
    expect(unitCost("thunderlord", "tar")).toBe(5);
    expect(COPIES[unitCost("thunderlord")]).toBe(25);
    expect(COPIES[unitCost("thunderlord", "tar")]).toBe(10);
    expect(unitDefinition("thunderlord", "tar")).toMatchObject({
      hp: 1100,
      attack: 100,
      range: 4,
      interval: 4,
      initialMana: 50,
      traits: ["灵能", "狙击"],
    });
    expect(unitDefinition("thunderlord", "counterplay").traits).toEqual([
      "灵能",
      "爆破",
    ]);
    expect(skillName("thunderlord")).toBe("雷神锁链");
    expect(skillName("thunderlord", "tar")).toBe("九霄连雷");
    expect(skillDescription("thunderlord", "tar")).toContain("240%");
    const old = army([p("thunderlord", 1)], 0, "tar")[0];
    expect(old.lightningChain).toBeUndefined();
    expect(usesEnergy(old)).toBe(true);
  });
  for (const phase of ["prepare", "battle", "result", "finished"] as const)
    it(`0.50 ${phase}迁移保留卡池、资源、价格与进行中的战果`, () => {
      const g = createGame(137, "classic");
      g.catalogVersion = "tar";
      g.combatVersion = "tar";
      // Build a real old-price pool, rather than relabel a new 25-copy pool.
      g.pool = Object.fromEntries(
        Object.keys(UNIT).map((id) => [id, COPIES[unitCost(id, "tar")]]),
      );
      for (const player of g.players)
        for (const id of player.shop) if (id) g.pool[id]--;
      const pl = g.players[0];
      for (const id of pl.shop) if (id) g.pool[id]++;
      pl.shop.fill(null);
      const id = phase === "finished" ? "acolyte" : "thunderlord";
      pl.shop[0] = id;
      g.pool[id]--;
      expect(buy(g, pl, 0)).toBe(true);
      move(g, pl, pl.pieces[0].uid, 35);
      if (phase === "finished") pl.hp = 1;
      const result = phase === "prepare" ? null : startRound(g);
      if (phase === "result" || phase === "finished") settle(g, result!);
      expect(g.phase).toBe(phase);
      expect(validGame(g)).toBe(true);
      const before = structuredClone(g),
        data = decodeSave(
          JSON.stringify({
            schema: 49,
            rules: "singleplayer-0.50",
            savedAt: 1,
            revision: 1,
            game: g,
            playback: { time: 3, speed: 2, paused: true },
          }),
        );
      expect(data.status).toBe("migrated");
      expect(data.data!.schema).toBe(SAVE_SCHEMA);
      expect(data.data!.game).toEqual({
        ...before,
        combatVersion: phase === "prepare" ? CURRENT_COMBAT_VERSION : "tar",
      });
      expect(data.data!.playback).toEqual({ time: 3, speed: 2, paused: true });
      expect(validGame(data.data!.game)).toBe(true);
      if (phase === "battle")
        expect(resumeRound(data.data!.game)!.battle).toEqual(result!.battle);
      if (phase === "result") {
        if (data.data!.game.reward) claimReward(data.data!.game, 0);
        nextRound(data.data!.game);
        expect(data.data!.game.combatVersion).toBe(CURRENT_COMBAT_VERSION);
        expect(data.data!.game.catalogVersion).toBe("tar");
      }
      if (phase === "prepare") {
        const gold = data.data!.game.players[0].gold;
        expect(
          sell(data.data!.game, data.data!.game.players[0], pl.pieces[0].uid),
        ).toBe(true);
        expect(data.data!.game.players[0].gold - gold).toBe(5);
      }
    });
  for (const entry of frozen.fixtures)
    it(`冻结0.50回放 ${entry.name}`, async () => {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(simulate(entry.left, entry.right, "tar")),
        ),
      );
      expect(
        Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(entry.hash);
    });
});
