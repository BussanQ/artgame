import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  advanceAirSkills,
  damage,
  type CombatContext,
} from "../src/engine/abilities";
import { advanceTarBombs, updateTarBombPositions } from "../src/engine/tar";
import { silence } from "../src/engine/infantry-skills";
import {
  MOTOR_TAR,
  skillName,
  skillRole,
  skillDescription,
} from "../src/data/skills";
import { unitDefinition } from "../src/data/unit-stats";
import {
  CURRENT_COMBAT_VERSION,
  type Fighter,
  type Piece,
} from "../src/engine/types";
import {
  createGame,
  buy,
  move,
  startRound,
  resumeRound,
  settle,
  nextRound,
} from "../src/engine/game";
import { claimReward } from "../src/engine/equipment";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { isRecruitable } from "../src/engine/rotation";
import { abilityCredit } from "../src/engine/ai";
import { compute } from "../src/compute/job";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { TAR_DEMO } from "../src/data/tar-demo";
import { tarCells, tarMarkers, drawTarBombs } from "../src/render/tar";
import frozen from "./fixtures/pre-v050-replays.json";

const p = (defId: string, uid: number, star = 1, position = 35): Piece => ({
  defId,
  uid,
  star,
  position,
});
const f = (id: string, uid: number, side: 0 | 1 = 0, star = 1): Fighter =>
  Object.assign(army([p(id, uid, star)], side, "tar")[0], {
    x: 3,
    y: side ? 4 : 5,
    hp: 10000,
    maxHp: 10000,
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

describe("焦油弹真实结算", () => {
  for (const star of [1, 2, 3])
    it(`${star}星只投不同的${star}个目标，逐弹计3秒并冻结技能强度`, () => {
      const source = f("motorcycle", 1, 0, star),
        targets = [f("guard", 2, 1), f("guard", 3, 1), f("guard", 4, 1)];
      Object.assign(targets[1], { x: 2, y: 5 });
      Object.assign(targets[2], { x: 4, y: 5 });
      const c = ctx(source, ...targets);
      source.skillPower = 1.2;
      expect(castSkill(c, source, targets[0])).toBe(true);
      source.skillPower = 9;
      source.attack = 99999;
      for (c.tick = 11; c.tick <= 23; c.tick++) {
        advanceAirSkills(c, source);
        advanceTarBombs(c);
      }
      expect(source.tar!.launched).toBe(star);
      expect(new Set(source.tar!.bombs.map((b) => b.target)).size).toBe(star);
      expect(c.events).toHaveLength(0);
      expect(source.tar!.bombs.map((b) => b.until)).toEqual(
        [24, 26, 28].slice(0, star),
      );
      for (c.tick = 24; c.tick <= 28; c.tick++) advanceTarBombs(c);
      expect(c.events.map((e) => e.amount)).toEqual(
        Array(star).fill(MOTOR_TAR.damage[star - 1] * 1.2),
      );
      expect(
        c.events.every(
          (e) =>
            e.skill && e.primary && e.damageType === "magic" && !e.periodic,
        ),
      ).toBe(true);
      expect(source.tar!.detonated).toBe(star);
      expect(source.air!.cast).toBeUndefined();
      expect(source.tar!.bombs).toHaveLength(0);
    });
  it("黏附跟随目标移动，远离原落点及队友减少溅射", () => {
    const a = f("motorcycle", 1),
      b = f("guard", 2, 1),
      neighbor = f("guard", 3, 1),
      entrant = f("guard", 4, 1),
      ally = f("guard", 5);
    Object.assign(neighbor, { x: 3, y: 3 });
    Object.assign(entrant, { x: 0, y: 0 });
    const c = ctx(a, b, neighbor, entrant, ally);
    castSkill(c, a, b);
    c.tick = 12;
    advanceAirSkills(c, a);
    Object.assign(b, { x: 0, y: 1 });
    Object.assign(neighbor, { x: 0, y: 0 });
    Object.assign(entrant, { x: 3, y: 4 });
    c.tick = 24;
    advanceTarBombs(c);
    expect(c.events.map((e) => [e.target, e.amount, e.primary])).toEqual([
      [2, 300, true],
      [3, 120, false],
    ]);
    expect(b.hp).toBe(9700);
    expect(entrant.hp).toBe(10000);
    expect(ally.hp).toBe(10000);
  });
  it("目标死亡后留下最后位置，随后同UID复活不会重新黏附", () => {
    const a = f("motorcycle", 1),
      b = f("guard", 2, 1),
      entrant = f("guard", 3, 1);
    Object.assign(entrant, { x: 0, y: 0 });
    const c = ctx(a, b, entrant);
    castSkill(c, a, b);
    c.tick = 12;
    advanceAirSkills(c, a);
    Object.assign(b, { x: 2, y: 2, hp: 0 });
    updateTarBombPositions(c);
    expect(a.tar!.bombs[0].attached).toBe(false);
    Object.assign(b, { x: 6, y: 6, hp: 10000 });
    Object.assign(entrant, { x: 2, y: 2 });
    c.tick = 24;
    advanceTarBombs(c);
    expect(c.events.map((e) => [e.target, e.amount])).toEqual([[3, 300]]);
  });
  it("已投弹按爆炸时施法者阵营判敌，魅惑后不会伤害新队友", () => {
    const a = f("motorcycle", 1),
      b = f("guard", 2, 1),
      ally = f("guard", 3);
    Object.assign(ally, { x: 3, y: 3 });
    const c = ctx(a, b, ally);
    castSkill(c, a, b);
    c.tick = 12;
    advanceAirSkills(c, a);
    a.side = 1;
    a.charm = { until: 99, side: 0, attack: a.attack };
    c.tick = 24;
    advanceTarBombs(c);
    expect(c.events.map((e) => [e.target, e.amount])).toEqual([[3, 120]]);
    expect(b.hp).toBe(10000);
  });
  for (const kind of ["stun", "silence", "charm", "death"] as const)
    it(`${kind}取消未投出的弹，已落地弹继续引爆`, () => {
      const a = f("motorcycle", 1, 0, 3),
        b = f("guard", 2, 1),
        d = f("guard", 3, 1);
      Object.assign(d, { x: 2, y: 5 });
      const c = ctx(a, b, d);
      castSkill(c, a, b);
      c.tick = 12;
      advanceAirSkills(c, a);
      if (kind === "stun") a.stunUntil = 99;
      if (kind === "silence") silence(c, b, a, 30);
      if (kind === "death") damage(c, b, a, 99999, "true", true);
      if (kind === "charm") {
        a.charm = { until: 99, side: 0, attack: a.attack };
        a.side = 1;
      }
      c.tick = 14;
      advanceAirSkills(c, a);
      expect(a.air!.cast).toBeUndefined();
      expect(a.tar!.bombs).toHaveLength(1);
      expect(a.skillReadyAt).toBe(50);
      expect(a.mana).toBe(kind === "death" ? 10 : 0);
      c.events = [];
      c.tick = 24;
      advanceTarBombs(c);
      expect(a.tar!.detonated).toBe(1);
      expect(c.events.filter((e) => e.attacker === 1)).toHaveLength(
        kind === "charm" ? 0 : 1,
      );
    });
  it("施法前眩晕、沉默、魅惑和无射程内目标不消耗能量或冷却", () => {
    for (const kind of ["stun", "silence", "charm", "range"]) {
      const a = f("motorcycle", 1),
        b = f("guard", 2, 1),
        c = ctx(a, b);
      if (kind === "stun") a.stunUntil = 99;
      if (kind === "silence") a.silenceUntil = 99;
      if (kind === "charm") a.charm = { until: 99, side: 0, attack: a.attack };
      if (kind === "range") Object.assign(b, { x: 0, y: 0 });
      expect(castSkill(c, a, b)).toBe(false);
      expect(a.mana).toBe(100);
      expect(a.skillReadyAt).toBeUndefined();
    }
  });
  it("目标不足不重复投弹；冷却未到时保留满能量", () => {
    const a = f("motorcycle", 1, 0, 3),
      b = f("guard", 2, 1),
      c = ctx(a, b);
    castSkill(c, a, b);
    c.tick = 12;
    advanceAirSkills(c, a);
    c.tick = 14;
    advanceAirSkills(c, a);
    expect(a.tar!.launched).toBe(1);
    expect(a.air!.cast).toBeUndefined();
    a.mana = 100;
    c.tick = 49;
    expect(castSkill(c, a, b)).toBe(false);
    expect(a.mana).toBe(100);
    c.tick = 50;
    expect(castSkill(c, a, b)).toBe(true);
  });
  it("中心魔抗和护盾生效，溅射可命中隐蔽/飞行敌人，已落地弹不被反伤取消", () => {
    const a = f("motorcycle", 1),
      b = f("guard", 2, 1),
      d = f("fish", 3, 1),
      c = ctx(a, b, d);
    Object.assign(d, { x: 3, y: 3 });
    b.shield = 100;
    b.magicResist = 0.5;
    b.reflection = 99999;
    castSkill(c, a, b);
    c.tick = 12;
    advanceAirSkills(c, a);
    c.tick = 24;
    advanceTarBombs(c);
    expect(c.events.find((e) => e.target === 2)).toMatchObject({
      amount: 50,
      absorbed: 100,
    });
    expect(a.hp).toBe(0);
    expect(c.events.find((e) => e.target === 3)).toMatchObject({
      amount: 120,
      damageType: "magic",
    });
  });
  it("残魂和旋转免伤仍阻挡爆炸，不追加眩晕/灼烧/减速", () => {
    const a = f("motorcycle", 1, 0, 2),
      b = f("vine", 2, 1),
      d = f("swordthrall", 3, 1);
    Object.assign(d, { x: 2, y: 5 });
    const c = ctx(a, b, d);
    castSkill(c, a, b);
    c.tick = 12;
    advanceAirSkills(c, a);
    c.tick = 14;
    advanceAirSkills(c, a);
    b.immortal = { duration: 99, until: 99, spent: true };
    d.bladeStorm = { until: 99, next: 50, remaining: 6, damage: 50 };
    c.tick = 26;
    advanceTarBombs(c);
    expect(c.events).toHaveLength(2);
    expect(c.events.every((e) => e.immune)).toBe(true);
    expect(b.burn).toBeUndefined();
    expect(b.slow).toBeUndefined();
    expect(b.stunUntil).toBe(0);
  });
});

describe("版本、回放、Worker与信息", () => {
  it("新定义与图鉴接入，旧三连发基础属性及技能保持", () => {
    expect(unitDefinition("motorcycle", "tar")).toMatchObject({
      hp: 750,
      attack: 72,
      interval: 4,
      skill: "焦油弹",
    });
    expect(unitDefinition("motorcycle", "taotie")).toMatchObject({
      hp: 750,
      attack: 72,
      interval: 4,
      skill: "三连发",
    });
    expect(skillName("motorcycle")).toBe("焦油弹");
    expect(skillRole("motorcycle")).toBe("延迟范围爆破");
    expect(skillDescription("motorcycle")).toContain("黏附");
    expect(skillDescription("motorcycle", "taotie")).toContain("共三发");
    expect(army([p("motorcycle", 1)], 0, "taotie")[0].tar).toBeUndefined();
    expect(army([p("skytoad", 2)], 0)[0].taotie).toEqual({ feasts: 0 });
  });
  it("完整模拟、快速结算和Worker逐帧一致；分析不提前透露后续投弹和伤害", () => {
    const before = structuredClone(TAR_DEMO);
    const b = simulate(TAR_DEMO.left, TAR_DEMO.right, "tar"),
      fast = simulateOutcome(TAR_DEMO.left, TAR_DEMO.right, "tar");
    const job = compute({ kind: "replay", ...TAR_DEMO, version: "tar" });
    expect(job.kind === "replay" && job.battle).toEqual(b);
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect(fast.winner).toBe(b.winner);
    expect(TAR_DEMO).toEqual(before);
    const first = b.frames.findIndex((fr) =>
      fr.effects.some((e) => e.kind === "tar"),
    );
    expect(first).toBeGreaterThan(0);
    const row = analyzeBattle(b, first).sides[0].fighters.find(
      (f) => f.uid === 101,
    )!;
    expect(row.tar).toEqual({ launched: 1, detonated: 0 });
    expect(row.skillDamage).toBe(0);
    expect(
      analyzeBattle(b).sides[0].fighters.find((f) => f.uid === 101)!.tar!
        .detonated,
    ).toBeGreaterThan(0);
  });
  it("AI计入技能装备，地面预警只画棋盘内五格且减少动态效果仍显示倒计时", () => {
    const piece = p("motorcycle", 1, 2);
    expect(abilityCredit({ ...piece, items: ["staff"] })).toBeGreaterThan(
      abilityCredit(piece),
    );
    expect(tarCells(0, 0)).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
    const a = f("motorcycle", 1);
    a.tar!.bombs = [
      {
        target: 2,
        x: 3,
        y: 3,
        until: 24,
        damage: 300,
        splash: 120,
        attached: true,
      },
    ];
    const labels: string[] = [];
    const context = new Proxy(
      { fillText: (s: string) => labels.push(s) },
      { get: (o, k) => (k in o ? o[k as keyof typeof o] : () => {}) },
    ) as unknown as CanvasRenderingContext2D;
    drawTarBombs(context, [a], 12, true);
    expect(labels).toEqual(["爆 3.0s"]);
    drawTarBombs(context, [a], 24, false);
    expect(labels).toHaveLength(1);
  });
  it("同一目标多弹合并，跟随插值位置并显示最早倒计时，查看不修改快照", () => {
    const a = f("motorcycle", 1),
      b = f("motorcycle", 2),
      carrier = f("guard", 3, 1);
    Object.assign(carrier, { x: 2.5, y: 3.5 });
    a.tar!.bombs = [
      {
        target: 3,
        x: 2,
        y: 3,
        until: 24,
        damage: 300,
        splash: 120,
        attached: true,
      },
    ];
    b.tar!.bombs = [
      {
        target: 3,
        x: 2,
        y: 3,
        until: 28,
        damage: 300,
        splash: 120,
        attached: true,
      },
    ];
    const fighters = [a, b, carrier],
      before = structuredClone(fighters);
    expect(tarMarkers(fighters, 12)).toEqual([
      { x: 2.5, y: 3.5, until: 24, count: 2, side: 0 },
    ]);
    expect(tarMarkers(fighters, 24)).toEqual([
      { x: 2.5, y: 3.5, until: 28, count: 1, side: 0 },
    ]);
    expect(fighters).toEqual(before);
  });
  for (const entry of frozen.fixtures)
    it(`冻结0.49回放${entry.name}`, async () => {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(simulate(entry.left, entry.right, "taotie")),
        ),
      );
      expect(
        Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(entry.hash);
    });
  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`0.49 ${banned}/${phase}迁移保留经济、卡池和进行中战斗`, () => {
        const g = createGame(137, "classic");
        g.combatVersion = "taotie";
        g.catalogVersion = "taotie";
        for (const player of g.players) {
          for (const id of player.shop) if (id) g.pool[id]++;
          player.shop.fill(null);
        }
        // Five-cost thunderlord had ten copies in this historical catalogue.
        g.pool.thunderlord = 10;
        if (banned) {
          g.bannedSeries = ["野兽", "熊猫", "傀儡"];
          for (const id of Object.keys(g.pool))
            if (!isRecruitable(g, id)) g.pool[id] = 0;
        }
        const pl = g.players[0],
          id = phase === "finished" ? "acolyte" : "motorcycle";
        pl.shop[0] = id;
        g.pool[id]--;
        expect(buy(g, pl, 0)).toBe(true);
        move(g, pl, pl.pieces[0].uid, 35);
        if (phase === "finished") pl.hp = 1;
        const result = phase === "prepare" ? null : startRound(g);
        if (phase === "result" || phase === "finished") settle(g, result!);
        expect(g.phase).toBe(phase);
        const before = structuredClone(g);
        const d = decodeSave(
          JSON.stringify({
            schema: 48,
            rules: "singleplayer-0.49",
            savedAt: 1,
            revision: 1,
            game: g,
            playback: { time: 3, speed: 2, paused: true },
          }),
        );
        expect(d.status).toBe("migrated");
        expect(d.data!.schema).toBe(SAVE_SCHEMA);
        expect(d.data!.game).toEqual({
          ...before,
          combatVersion:
            phase === "prepare" ? CURRENT_COMBAT_VERSION : "taotie",
        });
        expect(validGame(d.data!.game)).toBe(true);
        expect(d.data!.playback).toEqual({ time: 3, speed: 2, paused: true });
        if (phase === "battle")
          expect(resumeRound(d.data!.game)!.battle).toEqual(result!.battle);
        if (phase === "result") {
          if (d.data!.game.reward) claimReward(d.data!.game, 0);
          nextRound(d.data!.game);
          expect(d.data!.game.combatVersion).toBe(CURRENT_COMBAT_VERSION);
        }
      });
});
