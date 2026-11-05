import { CURRENT_COMBAT_VERSION } from "../src/engine/types";
import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  damage,
  gainMana,
  type CombatContext,
} from "../src/engine/abilities";
import {
  attackTargets,
  carapaceArmor,
  concealed,
  effectiveArmor,
  skillGauge,
  skillReady,
} from "../src/engine/triggers";
import { createGame, startRound, nextRound, settle } from "../src/engine/game";
import { decodeSave, SAVE_SCHEMA } from "../src/engine/persistence";
import { claimReward, itemScore } from "../src/engine/equipment";
import { skillDescription } from "../src/data/skills";
import type { Fighter, Piece } from "../src/engine/types";
const p = (defId: string, uid: number, position = 35, star = 1): Piece => ({
  defId,
  uid,
  position,
  star,
});
const f = (
  id: string,
  uid: number,
  side: 0 | 1,
  x: number,
  y: number,
  star = 1,
) => Object.assign(army([p(id, uid, 35, star)], side)[0], { x, y });
const ctx = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 1,
  events: [],
  effects: [],
});
describe("原型 0.7 的兵种触发方式", () => {
  it("马骑兵仅冲锋一次，回能装备、受击和满能量不能再次触发", () => {
    const a = f("cavalry", 1, 0, 0, 7),
      b = f("titan", 2, 1, 4, 1),
      c = ctx(a, b);
    expect(a.mana).toBe(0);
    expect(skillReady(a)).toBe(true);
    expect(castSkill(c, a, b)).toBe(true);
    expect(a.signature!.casts).toBe(1);
    gainMana(a, 100, 1);
    damage(c, b, a, 1);
    expect(a.mana).toBe(0);
    a.mana = 100;
    expect(castSkill(c, a, b)).toBe(false);
    expect(skillGauge(a).progress).toBe(0);
  });
  it("冲锋无合法落点时不消耗开场机会", () => {
    const a = f("cavalry", 1, 0, 0, 7),
      b = f("titan", 2, 1, 4, 1);
    const blockers = [
      [3, 1],
      [5, 1],
      [4, 0],
      [4, 2],
    ].map(([x, y], i) => f("guard", 3 + i, 1, x, y));
    expect(castSkill(ctx(a, b, ...blockers), a, b)).toBe(false);
    expect(a.signature!.casts).toBe(0);
    expect(castSkill(ctx(a, b), a, b)).toBe(true);
  });
  it.each([1, 2, 3])("%i 星玄甲在对应 8/12/16 秒衰减，与鹿护甲独立", (star) => {
    const a = f("turtle", 1, 0, 3, 4, star),
      b = f("infantry", 2, 1, 3, 3),
      c = ctx(a, b);
    castSkill(c, a, b);
    const duration = (4 + star * 4) * 4;
    expect(carapaceArmor(a, 1)).toBe(12);
    expect(carapaceArmor(a, 1 + duration / 2)).toBe(6);
    expect(carapaceArmor(a, 1 + duration)).toBe(0);
    a.armorBuff = 6;
    a.armorBuffUntil = 100;
    expect(effectiveArmor(a, 1 + duration / 2)).toBe(a.armor + 12);
    const full = damage(c, b, a, 100);
    c.tick = 1 + duration;
    expect(damage(c, b, a, 100)).toBeGreaterThan(full);
    a.mana = 100;
    expect(castSkill(c, a, b)).toBe(false);
  });
  it("虎的第 1/5/9 次攻击是箭雨，加速缩短箭雨循环，双方克隆不受污染", () => {
    const source = p("tiger", 1, 35, 1),
      target = p("turtle", 2, 35, 3);
    const battle = simulate([source], [target]);
    const hits = battle.frames.flatMap((frame) =>
      frame.events.filter((e) => e.attacker === 1 && e.primary),
    );
    expect(hits.length).toBeGreaterThanOrEqual(9);
    hits.forEach((hit, i) => expect(hit.skill).toBe(i % 4 === 0));
    const quick = simulate([{ ...source, items: ["overdrive"] }], [target]);
    const castTicks = (value: typeof battle) =>
      value.frames
        .filter((frame) =>
          frame.effects.some(
            (effect) => effect.kind === "cast" && effect.source === 1,
          ),
        )
        .map((frame) => frame.tick);
    expect(castTicks(quick)[1]).toBeLessThan(castTicks(battle)[1]);
    expect(source).toEqual(p("tiger", 1, 35, 1));
  });
  it("灵鱼在护卫旁隐蔽，范围伤害仍命中；友军死亡或敌方鱼看破后可被选中", () => {
    const fish = f("fish", 1, 0, 3, 4),
      guard = f("guard", 2, 0, 3, 5),
      enemy = f("tiger", 3, 1, 3, 3),
      seer = f("fish", 4, 1, 3, 1);
    const team = [fish, guard, enemy];
    expect(concealed(fish, team)).toBe(true);
    expect(attackTargets(enemy, team).map((f) => f.uid)).toEqual([2]);
    const hp = fish.hp;
    castSkill(ctx(...team), enemy, guard);
    expect(fish.hp).toBeLessThan(hp);
    expect(concealed(fish, [...team, seer])).toBe(false);
    guard.hp = 0;
    expect(concealed(fish, team)).toBe(false);
    expect(attackTargets(enemy, team).map((f) => f.uid)).toContain(1);
    const otherFish = f("fish", 5, 0, 3, 5);
    expect(concealed(fish, [fish, otherFish, enemy])).toBe(false);
  });
  it("装备评估不奖励已经无效的回能和玄甲法强，旧版本评分保持原值", () => {
    expect(itemScore(p("turtle", 1), "crystal")).toBe(0);
    expect(itemScore(p("turtle", 1), "crystal", "balanced")).toBeGreaterThan(0);
    expect(itemScore(p("tiger", 1), "crystal")).toBeLessThan(
      itemScore(p("tiger", 1), "crystal", "balanced"),
    );
    expect(itemScore(p("fish", 1), "crystal")).toBeGreaterThan(0);
  });
  it("新版完整模拟和轻量试算一致，展示字段只存在于新版", () => {
    const left = [p("cavalry", 1), p("fish", 2, 43), p("tiger", 3, 59)],
      right = [p("turtle", 4), p("deer", 5, 43)];
    const battle = simulate(left, right),
      fast = simulateOutcome(left, right);
    expect(fast.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
    expect(fast.winner).toBe(battle.winner);
    expect(army(left, 0, "balanced").some((f) => f.signature)).toBe(false);
    expect(skillDescription("tiger")).toContain("第 1、5、9");
    expect(skillDescription("tiger", "balanced")).toContain("能量满 100");
  });
  it("更新前四版二十单位战斗的完整快照 SHA-256 原样保留", async () => {
    // Freeze the 0.7 inputs from commit 04420db; later additions must not shift this roster.
    const originalUnits = [
      "infantry",
      "guard",
      "pangolin",
      "panda",
      "sniper",
      "lion",
      "chariot",
      "monk",
      "wolf",
      "cannon",
      "master",
      "titan",
      "cavalry",
      "dragonfly",
      "shadowblade",
      "turtle",
      "tiger",
      "bull",
      "fish",
      "deer",
    ];
    const fixtures = (start: number) =>
      originalUnits.slice(start, start + 10).map((id, i) => ({
        ...p(id, start + i + 1, 32 + i, 2),
        items: i === 0 ? ["aegis"] : [],
      }));
    const expected = {
      signature:
        "3863c1d22455d08213436cca603ea8a129daa59e2deea67ed1b2574ec6dbfdbf",
      legacy:
        "6cdf0579b35fa3b1a418d37f59ccdd0756a00740fc9672808d66448aa0844998",
      tactics:
        "5888289375f5e904e67e7ee8efd9b4decab2ca6a2e72b0c270f07c0fe6952c8c",
      balanced:
        "14ec85ee7b1d009b8c7ecd1327635e36ec34b0cfb643100eaca3255234227b8b",
    };
    for (const version of [
      "legacy",
      "tactics",
      "balanced",
      "signature",
    ] as const) {
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(simulate(fixtures(0), fixtures(10), version)),
        ),
      );
      expect(
        Array.from(new Uint8Array(hash), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(expected[version]);
    }
  });
  it("0.6 存档准备阶段升级，进行中战斗和历史继续旧规则，下一轮才切换", () => {
    const game = createGame(137, "classic");
    game.combatVersion = "balanced";
    const piece = p("guard", game.nextUid++);
    game.players[0].pieces.push(piece);
    game.pool.guard--;
    const encode = () =>
      JSON.stringify({
        schema: 5,
        rules: "singleplayer-0.6",
        savedAt: 1,
        revision: 1,
        game,
        playback: { time: 0, speed: 1, paused: false },
      });
    const prepare = decodeSave(encode());
    expect(prepare.data!.schema).toBe(SAVE_SCHEMA);
    expect(prepare.data!.game).toEqual({
      ...game,
      combatVersion: CURRENT_COMBAT_VERSION,
    });
    const result = startRound(game)!;
    const restored = decodeSave(encode()).data!.game;
    expect(restored).toEqual(game);
    settle(restored, result);
    expect(restored.history[0].combatVersion).toBe("balanced");
    if (restored.reward) claimReward(restored, 0);
    nextRound(restored);
    expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
    const report = restored.history[0];
    expect(simulate(report.left, report.right, report.combatVersion)).toEqual(
      result.battle,
    );
  });
});
