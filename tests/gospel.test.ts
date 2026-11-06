import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { advanceGospel, inGospelField, gospelActive } from "../src/engine/gospel";
import { gainMana, castSkill, type CombatContext } from "../src/engine/abilities";
import { usesEnergy, skillReady } from "../src/engine/triggers";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { unitDefinition, unitSprite } from "../src/data/unit-stats";
import { unitCost } from "../src/data/catalog";
import { skillName, skillDescription } from "../src/data/skills";
import { mergeCount } from "../src/engine/progression";
import { CURRENT_COMBAT_VERSION } from "../src/engine/types";
import type { Fighter, Piece } from "../src/engine/types";
import { createGame, buy, sell, startRound, settle, resumeRound, nextRound } from "../src/engine/game";
import { claimReward, itemScore } from "../src/engine/equipment";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import { COPIES, UNITS, RULES } from "../src/data/units";
import { compute } from "../src/compute/job";
import { GOSPEL_DEMO } from "../src/data/gospel-demo";
import { rangedActionName, rangedPose } from "../src/render/ranged";
import frozen from "./fixtures/pre-v052-replays.json";
import uncovered from "./fixtures/gospel-uncovered-field.json";
import { deployLineup } from "../src/engine/ai";

const p = (defId: string, uid: number, star = 1, position: number | null = 51): Piece =>
  ({ defId, uid, star, position });
const f = (defId: string, uid: number, star = 1, side: 0 | 1 = 0): Fighter =>
  Object.assign(army([p(defId, uid, star)], side)[0], { x: 3, y: 3, mana: 0 });
const ctx = (...fighters: Fighter[]): CombatContext =>
  ({ fighters, tick: 4, events: [], effects: [] });

describe("童子福音持续供能", () => {
  for (const [star, amount] of [[1, 4], [2, 7], [3, 10]])
    it(`${star}星每秒为全部合格友军回复${amount}能量`, () => {
      const source = f("acolyte", 1, star),
        allies = [f("stormcaller", 2), f("titan", 3), f("medic", 4)],
        state = ctx(source, ...allies);
      for (const tick of [1, 2, 3]) {
        state.tick = tick;
        advanceGospel(state);
      }
      expect(allies.map((a) => a.mana)).toEqual([0, 0, 0]);
      state.tick = 4;
      advanceGospel(state);
      expect(allies.map((a) => a.mana)).toEqual([amount, amount, amount]);
      expect(state.effects.map((e) => e.amount)).toEqual([amount, amount, amount]);
      expect(source.gospelAura).toMatchObject({ pulses: 1, peakTargets: 3, targets: [2, 3, 4] });
      expect(source.mana).toBe(0);
      expect(state.events).toEqual([]);
      state.tick = 8;
      advanceGospel(state);
      expect(allies.map((a) => a.mana)).toEqual([amount * 2, amount * 2, amount * 2]);
    });
  it("圆形半径包含斜向近邻和边界，排除圆外与敌方", () => {
    const a = f("acolyte", 1), edge = f("guard", 2), diagonal = f("guard", 3),
      outside = f("guard", 4), enemy = f("guard", 5, 1, 1);
    Object.assign(edge, { x: 6 });
    Object.assign(diagonal, { x: 5, y: 5 });
    Object.assign(outside, { x: 6, y: 4 });
    expect(inGospelField(a, edge)).toBe(true);
    expect(inGospelField(a, diagonal)).toBe(true);
    expect(inGospelField(a, outside)).toBe(false);
    const state = ctx(a, edge, diagonal, outside, enemy);
    advanceGospel(state);
    expect(state.effects.map((e) => e.target)).toEqual([2, 3]);
    expect(outside.mana).toBe(0);
    expect(enemy.mana).toBe(0);
  });
  it("重叠取最高星级，同星取UID；不同覆盖区域可分别供能", () => {
    const low = f("acolyte", 1), high = f("acolyte", 8, 3), tie = f("acolyte", 7, 3),
      near = f("guard", 10), far = f("guard", 11);
    high.x = tie.x = 5;
    far.x = 0;
    const state = ctx(high, low, far, tie, near);
    advanceGospel(state);
    expect(state.effects.map((e) => [e.source, e.target, e.amount])).toEqual([[1, 11, 4], [7, 10, 10]]);
    expect(high.gospelAura!.targets).toEqual([]);
    expect(tie.gospelAura!.targets).toEqual([10]);
  });
  it("封能、满能量、死亡和无能量技能单位不会消耗或储存供能", () => {
    const a = f("acolyte", 1), locked = f("guard", 2), full = f("guard", 3), dead = f("guard", 4),
      passives = ["acolyte", "thunderlord", "birdrider", "staffthrall", "blastbug"].map((id, i) => f(id, 10 + i));
    locked.manaLockUntil = 5;
    full.mana = 100;
    dead.hp = 0;
    const state = ctx(a, locked, full, dead, ...passives);
    advanceGospel(state);
    expect(state.effects).toEqual([]);
    locked.manaLockUntil = 0;
    full.mana = 95;
    state.tick = 8;
    advanceGospel(state);
    expect(locked.mana).toBe(4);
    expect(full.mana).toBe(99);
    expect(passives.every((unit) => unit.mana === 0)).toBe(true);
  });
  it("只统计实际补能，骑兵减量每秒扣一次，零收益不生成浮字", () => {
    const a = f("acolyte", 1, 3), b = f("guard", 2), c = f("guard", 3), d = f("guard", 4);
    b.mana = 97;
    c.energyMultiplier = 0.75;
    c.energyPenalty = 3;
    d.energyPenalty = 20;
    const state = ctx(a, b, c, d);
    advanceGospel(state);
    expect(b.mana).toBe(100);
    expect(c.mana).toBe(4.5);
    expect(d.mana).toBe(0);
    expect(state.effects.map((e) => e.amount)).toEqual([3, 4.5]);
  });
  it("眩晕沉默不关闭光环，魅惑暂停且不补发错过的脉冲，死亡即停", () => {
    const a = f("acolyte", 1), b = f("guard", 2), state = ctx(a, b);
    a.stunUntil = a.silenceUntil = 100;
    advanceGospel(state);
    expect(b.mana).toBe(4);
    a.charm = { side: 0, until: 12, attack: a.attack };
    state.tick = 8;
    advanceGospel(state);
    expect(b.mana).toBe(4);
    delete a.charm;
    state.tick = 12;
    advanceGospel(state);
    expect(b.mana).toBe(8);
    a.hp = 0;
    state.tick = 16;
    advanceGospel(state);
    expect(b.mana).toBe(8);
    expect(gospelActive(a)).toBe(false);
  });
  it("最高星级光环失效后较低星级接替；满能量与魅惑不会改变实际归属", () => {
    const low = f("acolyte", 1), high = f("acolyte", 2, 3), ally = f("guard", 3), state = ctx(low, high, ally);
    high.hp = 0;
    advanceGospel(state);
    expect(state.effects[0]).toMatchObject({ source: 1, target: 3, amount: 4 });
    expect(low.gospelAura!.pulses).toBe(1);
    expect(high.gospelAura!.pulses).toBe(0);
  });
  it("福音不受法强攻速影响，不积累能量或触发主动施法", () => {
    const a = f("acolyte", 1, 2), b = f("guard", 2), enemy = f("guard", 3, 1, 1);
    a.skillPower = 10;
    a.interval = 1;
    gainMana(a, 100, 4);
    expect(a.mana).toBe(0);
    expect(usesEnergy(a)).toBe(false);
    a.mana = 100;
    expect(skillReady(a)).toBe(false);
    const state = ctx(a, b, enemy);
    expect(castSkill(state, a, enemy)).toBe(false);
    advanceGospel(state);
    expect(b.mana).toBe(7);
    expect(a.signature!.casts).toBe(0);
  });
  it("新两费目录与旧一费主动行为分别保留，所有后续羁绊仍适用", () => {
    expect(unitCost("acolyte", "gospel")).toBe(2);
    expect(unitCost("acolyte", "lightning")).toBe(1);
    expect(unitDefinition("acolyte")).toMatchObject({ hp: 600, attack: 43, armor: 5, range: 4, interval: 6.8, initialMana: 0 });
    expect(unitDefinition("acolyte", "lightning")).toMatchObject({ hp: 480, attack: 24, interval: 4, initialMana: 50 });
    expect(unitSprite("acolyte", "gospel")).toBe("acolyte-gospel");
    expect(unitSprite("acolyte", "lightning")).toBe("acolyte");
    expect(skillName("acolyte", "gospel")).toBe("福音");
    expect(skillDescription("acolyte", "lightning")).toContain("2 名");
    const bugs = ["eyebug", "blastbug", "spider", "wasp"].map((id, i) => p(id, i + 1, 1, null));
    expect(mergeCount(bugs, "spider", 1)).toBe(2);
    expect(mergeCount(bugs, "spider", 2)).toBe(2);
  });
  it("新局实际扣两金、占用两费卡池，童子不被分配无效回能/法强装备", () => {
    const game = createGame(173, "classic"), player = game.players[0];
    for (const current of game.players) {
      for (const id of current.shop) if (id) game.pool[id]++;
      current.shop = [null, null, null, null, null];
    }
    expect(game.pool.acolyte).toBe(COPIES[2]);
    player.shop[0] = "acolyte";
    game.pool.acolyte--;
    expect(buy(game, player, 0)).toBe(true);
    expect(player.gold).toBe(8);
    expect(validGame(game)).toBe(true);
    const unit = player.pieces[0];
    expect(itemScore(unit, "crystal", "gospel")).toBe(0);
    expect(itemScore(unit, "crystal", "lightning")).toBeGreaterThan(0);
    expect(itemScore(unit, "core")).toBeGreaterThan(itemScore(unit, "coil"));
    expect(rangedActionName("acolyte", "gospel")).toBe("悬壳晶核脉冲");
    expect(rangedPose("acolyte", 0.5, false, false, true)).not.toEqual(rangedPose("acolyte", 0.5));
  });
  it("供能演示与Worker使用同一规则，片段统计包含新形象和供能状态", () => {
    const { left, right } = GOSPEL_DEMO;
    const result = compute({ kind: "replay", left, right, version: CURRENT_COMBAT_VERSION });
    expect(result.kind).toBe("replay");
    if (result.kind !== "replay") throw Error("Expected replay");
    const battle = simulate(left, right);
    expect(result.battle).toEqual(battle);
    const rows = analyzeBattle(battle).sides[0].fighters.filter((row) => row.gospelAura);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.casts === 0)).toBe(true);
    expect(rows.some((row) => row.gospelAura!.peakTargets > 2 && row.energyGiven > 0)).toBe(true);
    expect(analyzeBattle(battle, 0).sides[0].fighters.filter((row) => row.gospelAura)
      .every((row) => row.gospelAura!.pulses === 0 && row.energyGiven === 0)).toBe(true);
  });
  it("完整战斗保留普攻与真实供能，片段分析不读取未来", () => {
    const left = [p("acolyte", 1, 2, 59), p("stormcaller", 2, 2, 51), p("titan", 3, 2, 35)],
      right = [p("guard", 101, 3, 35), p("medic", 102, 2, 59)],
      battle = simulate(left, right),
      full = analyzeBattle(battle).sides[0].fighters.find((row) => row.uid === 1)!,
      start = analyzeBattle(battle, 0).sides[0].fighters.find((row) => row.uid === 1)!;
    expect(full.energyGiven).toBeGreaterThan(0);
    expect(full.casts).toBe(0);
    expect(start.energyGiven).toBe(0);
    expect(battle.frames.flatMap((frame) => frame.events).some((e) => e.attacker === 1 && !e.skill)).toBe(true);
    const outcome = simulateOutcome(left, right);
    expect(outcome).toMatchObject({ winner: battle.winner, damage: battle.damage });
    expect(outcome.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
    expect(outcome.final.tick).toBe(battle.frames.at(-1)!.tick);
  });
  for (const entry of frozen.fixtures)
    it(`冻结0.51回放 ${entry.name}`, async () => {
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(simulate(entry.left, entry.right, "lightning"))));
      expect(Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("")).toBe(entry.hash);
    });
});

describe("正常经营中童子脱离队友的布阵回归", () => {
  const supply = (pieces: Piece[]) => analyzeBattle(simulate(pieces, uncovered.right))
    .sides[0].fighters.filter((f) => f.gospelAura).reduce((n, f) => n + f.energyGiven, 0);
  for (const formation of ["spread", "compact"] as const)
    it(`${formation}把童子放回可供能队友附近，不改变阵容或资源`, () => {
      expect(supply(uncovered.left)).toBe(0);
      const player = createGame(173, "classic").players[0];
      player.level = uncovered.left.length;
      player.pieces = structuredClone(uncovered.left);
      const before = structuredClone(player);
      deployLineup(player, "standard", formation);
      expect(supply(player.pieces)).toBeGreaterThan(0);
      const positions = player.pieces.map((p) => p.position!);
      expect(new Set(positions).size).toBe(player.pieces.length);
      expect(positions.every((position) => position >= 32 && position < 64)).toBe(true);
      const stripPositions = (p: typeof player) => ({ ...p,
        pieces: p.pieces.map(({ position: _position, ...piece }) => piece) });
      expect(stripPositions(player)).toEqual(stripPositions(before));
      const again = structuredClone(before);
      deployLineup(again, "standard", formation);
      expect(again).toEqual(player);
    });
  it("旧战斗版本保持原布阵，当前分散布阵只移动童子", () => {
    const legacy = createGame(173, "classic").players[0];
    legacy.level = uncovered.left.length;
    legacy.pieces = structuredClone(uncovered.left);
    const current = structuredClone(legacy);
    deployLineup(legacy, "standard", "spread", "lightning");
    expect(legacy.pieces.map((p) => [p.uid, p.position]))
      .toEqual(uncovered.left.map((p) => [p.uid, p.position]));
    deployLineup(current, "standard", "spread", "gospel");
    expect(current.pieces.filter((p) => p.defId !== "acolyte"))
      .toEqual(legacy.pieces.filter((p) => p.defId !== "acolyte"));
    expect(current.pieces.find((p) => p.defId === "acolyte")!.position)
      .not.toBe(legacy.pieces.find((p) => p.defId === "acolyte")!.position);
  });
});

describe("福音版本与冻结价格目录迁移", () => {
  for (const [schema, rules, version] of [[50, "singleplayer-0.51", "lightning"], [49, "singleplayer-0.50", "tar"]] as const)
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`${rules} ${phase}保留一费目录、资源及旧回放，只在准备时切换福音`, () => {
        const game = createGame(137, "classic"), player = game.players[0];
        for (const current of game.players) current.shop = [null, null, null, null, null];
        game.catalogVersion = version;
        game.combatVersion = version;
        game.pool = Object.fromEntries(UNITS.map((u) => [u.id, COPIES[unitCost(u.id, version)]]));
        player.shop[0] = "acolyte";
        game.pool.acolyte--;
        expect(buy(game, player, 0)).toBe(true);
        expect(player.gold).toBe(9);
        player.pieces[0].position = 35;
        if (phase === "finished") player.hp = 1;
        const result = phase === "prepare" ? null : startRound(game)!;
        if (phase === "result" || phase === "finished") settle(game, result!);
        expect(game.phase).toBe(phase);
        expect(validGame(game)).toBe(true);
        const before = structuredClone(game);
        // Old envelopes may omit the catalogue; it must be filled by that stage's literal version.
        const serialized = structuredClone(game);
        delete serialized.catalogVersion;
        const decoded = decodeSave(JSON.stringify({ schema, rules, savedAt: 1, revision: 1,
          game: serialized, playback: { time: 3.25, speed: 4, paused: true } }));
        expect(decoded.status).toBe("migrated");
        expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
        expect(decoded.data!.rules).toBe(RULES.version);
        expect(decoded.data!.playback).toEqual({ time: 3.25, speed: 4, paused: true });
        const restored = decoded.data!.game;
        expect(restored).toEqual({ ...before, combatVersion: phase === "prepare" ? CURRENT_COMBAT_VERSION : version });
        expect(restored.catalogVersion).toBe(version);
        expect(validGame(restored)).toBe(true);
        if (phase === "battle") expect(resumeRound(restored)!.battle).toEqual(result!.battle);
        if (phase === "prepare") {
          expect(army(restored.players[0].pieces, 0, restored.combatVersion)[0].gospelAura).toBeDefined();
          const gold = restored.players[0].gold;
          expect(sell(restored, restored.players[0], restored.players[0].pieces[0].uid)).toBe(true);
          expect(restored.players[0].gold - gold).toBe(1);
        }
        if (phase === "result") {
          if (restored.reward) claimReward(restored, 0);
          nextRound(restored);
          expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
          expect(restored.catalogVersion).toBe(version);
          expect(unitCost("acolyte", restored.catalogVersion!)).toBe(1);
          expect(restored.history[0].combatVersion).toBe(version);
          expect(validGame(restored)).toBe(true);
        }
      });
});
