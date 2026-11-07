import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/pre-v023-replays.json";
import {
  CURRENT_COMBAT_VERSION,
  type CombatVersion,
  type Fighter,
  type Piece,
} from "../src/engine/types";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { damage, castSkill, type CombatContext } from "../src/engine/abilities";
import { synergies } from "../src/engine/synergies";
import { effectiveArmor } from "../src/engine/triggers";
import { callRetinue, callWolfPack } from "../src/engine/summons";
import { enterPhoenixEgg, hatchPhoenix } from "../src/engine/phoenix";
import { UNIT, RULES } from "../src/data/units";
import { compute } from "../src/compute/job";
import {
  buy,
  createGame,
  nextRound,
  resumeRound,
  settle,
  startRound,
} from "../src/engine/game";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { claimReward } from "../src/engine/equipment";
import { mergeCount } from "../src/engine/progression";
import { pieceDetails } from "../src/ui/bench-tooltip";
import { codexMarkup } from "../src/ui/unit-codex";

const ids = [
  "infantry",
  "guard",
  "sniper",
  "medic",
  "flametrooper",
  "grenadier",
];
const p = (
  defId: string,
  uid: number,
  position: number | null = 35,
): Piece => ({ defId, uid, star: 1, position });
const infantry = (count: number) =>
  ids.slice(0, count).map((id, i) => p(id, i + 1, 32 + i));
const context = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 1,
  events: [],
  effects: [],
});

describe("步兵编队减甲", () => {
  it.each([
    [1, 0],
    [2, 3],
    [3, 3],
    [4, 9],
    [5, 9],
    [6, 18],
  ])("%i种步兵使敌方护甲降低%i，替代旧生命加成", (count, reduction) => {
    const pieces = infantry(count),
      bonus = synergies(pieces).find((s) => s.trait === "步兵")!;
    expect(bonus.bonus.enemyArmor ?? 0).toBe(reduction);
    expect(bonus.tiers).toEqual([2, 4, 6]);
    const battle = simulate(pieces, [p("turtle", 101)]);
    const frame = battle.frames[0];
    expect(
      frame.fighters.find((f) => f.uid === 101)?.infantryArmorBreak ?? 0,
    ).toBe(reduction);
    for (const f of frame.fighters.filter((f) => f.side === 0)) {
      expect(f.maxHp).toBe(UNIT[f.defId].hp);
      expect(f.infantryArmorBreak).toBeUndefined();
    }
  });
  it("重复、升星和备战不增加种类，两方各自按对方编队减甲", () => {
    const left = [
      ...infantry(3),
      { ...p("infantry", 10, 40), star: 3 },
      p("medic", 11, null),
    ];
    const right = infantry(4).map((f) => ({ ...f, uid: f.uid + 100 }));
    const frame = simulate(left, right).frames[0];
    expect(
      frame.fighters
        .filter((f) => f.side === 0)
        .every((f) => f.infantryArmorBreak === 9),
    ).toBe(true);
    expect(
      frame.fighters
        .filter((f) => f.side === 1)
        .every((f) => f.infantryArmorBreak === 3),
    ).toBe(true);
  });
  it("物理伤害叠加临时破甲和护甲增益，零甲封底；法伤与真伤不受影响", () => {
    const [a, b] = [
      army([p("infantry", 1)], 0)[0],
      army([p("turtle", 2)], 1)[0],
    ];
    const hit = (
      type: "physical" | "magic" | "true",
      amount: number,
      temporary = 0,
      buff = 0,
    ) => {
      const target = structuredClone(b);
      Object.assign(target, {
        armor: 10,
        infantryArmorBreak: amount,
        armorBreak: temporary,
        armorBreakUntil: 20,
        armorBuff: buff,
        armorBuffUntil: 20,
        magicResist: 0.2,
        shield: 0,
      });
      const c = context(structuredClone(a), target);
      damage(c, c.fighters[0], target, 100, type, true);
      return c.events[0].amount;
    };
    expect(hit("physical", 0)).toBe(63);
    expect(hit("physical", 6)).toBe(81);
    expect(hit("physical", 6, 2)).toBe(89);
    expect(hit("physical", 6, 2, 4)).toBe(74);
    expect(hit("physical", 9, 4)).toBe(100);
    expect(hit("magic", 9)).toBe(hit("magic", 0));
    expect(hit("true", 9)).toBe(hit("true", 0));
  });
  it.each(["wolf", "adept", "shark"])(
    "%s后续召唤物继承敌方减甲，不增加卡池或改变原棋子",
    (id) => {
      const source = army([p(id, 101)], 1)[0];
      Object.assign(source, { infantryArmorBreak: 6, mana: 100, x: 3, y: 3 });
      const c = context(source);
      expect(
        id === "wolf" ? callWolfPack(c, source) : callRetinue(c, source),
      ).toBe(true);
      const summons = c.fighters.filter((f) => f.summon);
      expect(summons.length).toBeGreaterThan(0);
      for (const f of summons) {
        expect(f.infantryArmorBreak).toBe(6);
        expect(effectiveArmor(f, 1)).toBe(f.armor - 6);
      }
    },
  );
  it("灵鱼驱散和不死鸟化蛋重生均不清除整场编队减甲", () => {
    const fish = army([p("fish", 1)], 0)[0],
      target = army([{ ...p("phoenix", 2), star: 2 }], 0)[0],
      enemy = army([p("turtle", 3)], 1)[0];
    Object.assign(fish, { x: 3, y: 3, mana: 100 });
    Object.assign(target, {
      x: 3,
      y: 4,
      infantryArmorBreak: 6,
      armorBreak: 4,
      armorBreakUntil: 50,
    });
    const c = context(fish, target, enemy);
    expect(castSkill(c, fish, enemy)).toBe(true);
    expect(target.armorBreak).toBe(0);
    expect(target.infantryArmorBreak).toBe(6);
    target.hp = 0;
    expect(enterPhoenixEgg(c, target)).toBe(true);
    c.tick = 13;
    hatchPhoenix(c);
    expect(target.phoenix!.hatched).toBe(true);
    expect(target.infantryArmorBreak).toBe(6);
  });
  it("全量帧、快速推演和Worker相同，输入不被修改", () => {
    const left = infantry(6),
      right = [p("turtle", 101), p("wolf", 102, 43), p("shark", 103, 44)];
    const before = structuredClone([left, right]),
      b = simulate(left, right),
      fast = simulateOutcome(left, right);
    const worker = compute({
      kind: "replay",
      left,
      right,
      version: CURRENT_COMBAT_VERSION,
    });
    expect(worker).toEqual({ kind: "replay", battle: b });
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect([fast.winner, fast.damage]).toEqual([b.winner, b.damage]);
    expect([left, right]).toEqual(before);
  });
  it("图鉴、备战详情与旧版本说明分别匹配实际规则，异虫仍可两枚进化", () => {
    const current = pieceDetails(p("guard", 1)).traits.find(
      (t) => t.name === "步兵",
    )!.description;
    expect(current).toContain("4 个：全体敌人护甲降低 9 点");
    expect(current).not.toContain("生命 +");
    expect(
      pieceDetails(p("guard", 1), "metamorph").traits.find(
        (t) => t.name === "步兵",
      )!.description,
    ).toContain("生命 +300");
    expect(codexMarkup()).toContain("6 个不同棋子：全体敌人护甲降低 18 点");
    expect(mergeCount([p("eyebug", 1), p("blastbug", 2)], "eyebug", 1)).toBe(2);
    const f = army([p("bloodhawk", 1)], 0)[0];
    expect(f.hawkForm).toEqual({ active: false });
  });
});

describe("0.23旧回放冻结", () => {
  for (const fixture of fixtures.fixtures)
    for (const [version, hash] of Object.entries(fixture.hashes))
      it(`${fixture.name}/${version}与修改前逐帧哈希一致`, async () => {
        const b = simulate(
          fixture.left,
          fixture.right,
          version as CombatVersion,
        );
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(b)),
        );
        expect(
          Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join(""),
        ).toBe(hash);
      });
});

describe("0.22存档迁移", () => {
  it.each(["prepare", "battle", "result", "finished"] as const)(
    "%s阶段仅在下一次准备时切换规则，旧结算和战报保留",
    (phase) => {
      const g = createGame(137, "classic");
      g.combatVersion = "metamorph";
      const me = g.players[0];
      if (me.shop[0]) g.pool[me.shop[0]!]++;
      me.shop[0] = phase === "finished" ? "fish" : "guard";
      g.pool[me.shop[0]]--;
      expect(buy(g, me, 0)).toBe(true);
      me.pieces[0].position = 35;
      if (phase === "finished") me.hp = 1;
      const result = phase === "prepare" ? null : startRound(g);
      if (phase === "result" || phase === "finished") settle(g, result!);
      expect(g.phase).toBe(phase);
      expect(validGame(g)).toBe(true);
      const before = structuredClone(g);
      const decoded = decodeSave(
        JSON.stringify({
          schema: 21,
          rules: "singleplayer-0.22",
          savedAt: 1,
          revision: 1,
          game: g,
          playback: { time: 4, speed: 2, paused: true },
        }),
      );
      expect(decoded.status).toBe("migrated");
      expect(decoded.data).toMatchObject({
        schema: SAVE_SCHEMA,
        rules: RULES.version,
        playback: { time: 4, speed: 2, paused: true },
      });
      const restored = decoded.data!.game;
      expect(restored).toEqual({
        ...before,
        combatVersion:
          phase === "prepare" ? CURRENT_COMBAT_VERSION : "metamorph",
      });
      if (phase === "battle") {
        expect(resumeRound(restored)!.battle).toEqual(result!.battle);
        settle(restored, resumeRound(restored)!);
      }
      if (restored.phase === "result") {
        const settled = structuredClone(restored);
        settle(restored, result!);
        expect(restored).toEqual(settled);
        if (restored.reward) expect(claimReward(restored, 0)).toBe(true);
        nextRound(restored);
        expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
        const h = restored.history[0];
        expect(h.combatVersion).toBe("metamorph");
        expect(simulate(h.left, h.right, h.combatVersion)).toEqual(
          result!.battle,
        );
        expect(validGame(restored)).toBe(true);
      }
    },
  );
});
