import { describe, expect, it } from "vitest";
import frozen from "./fixtures/pre-v029-replays.json";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { synergies } from "../src/engine/synergies";
import { damage, type CombatContext } from "../src/engine/abilities";
import { callWolfPack, callRetinue } from "../src/engine/summons";
import { CURRENT_COMBAT_VERSION, type Piece } from "../src/engine/types";
import { UNIT, RULES } from "../src/data/units";
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
import { pieceDetails } from "../src/ui/bench-tooltip";
import { codexMarkup } from "../src/ui/unit-codex";

const p = (
  defId: string,
  uid: number,
  position: number | null = 35,
): Piece => ({ defId, uid, star: 1, position });
const armorIds = ["irondog", "ironape", "chariot", "titan"];
const blastIds = [
  "irondog",
  "ironape",
  "motorcycle",
  "bomber",
  "blastbug",
  "titan",
];
const line = (ids: string[], offset = 0) =>
  ids.map((id, i) => p(id, offset + i + 1, 32 + i * 3));
const left = line([...armorIds, "motorcycle", "bomber", "blastbug", "phoenix"]);
const right = line(
  [
    "wolf",
    "adept",
    "shark",
    "turtle",
    "medic",
    "birdrider",
    "guard",
    "specialist",
  ],
  100,
);

describe("装甲再生与爆破高档", () => {
  it.each([
    [1, 0],
    [2, 15],
    [3, 15],
    [4, 50],
  ])("%i种装甲每秒恢复%i，仅装甲受益且不额外加护甲", (count, rate) => {
    const pieces = [...line(armorIds.slice(0, count)), p("guard", 20, 60)];
    const bonus = synergies(pieces).find((s) => s.trait === "装甲")!;
    expect(bonus.tiers).toEqual([2, 4]);
    for (const f of army(pieces, 0)) {
      expect(f.armor).toBe(UNIT[f.defId].armor);
      expect(f.regeneration).toBe(f.defId === "guard" ? 0 : rate / 4);
      expect(f.armorRegen ?? 0).toBe(f.defId === "guard" ? 0 : rate / 4);
    }
  });
  it("重复、星级、备战不额外计数，升档采用总量不再次相加", () => {
    const pieces = [
      ...line(armorIds.slice(0, 2)),
      { ...p("irondog", 10, 50), star: 3 },
      p("chariot", 11, null),
      p("titan", 12, null),
    ];
    expect(synergies(pieces).find((s) => s.trait === "装甲")).toMatchObject({
      count: 2,
      bonus: { regen: 3.75 },
    });
    expect(synergies(left).find((s) => s.trait === "装甲")).toMatchObject({
      count: 4,
      bonus: { regen: 12.5 },
    });
  });
  it.each([5, 6])("%i种装甲包含高费替换成员，但不超过最高恢复档", (count) => {
    const pieces = line([...armorIds, "cannon", "shadowblade"].slice(0, count));
    expect(synergies(pieces).find((s) => s.trait === "装甲")).toMatchObject({
      count,
      tier: 2,
      bonus: { regen: 12.5 },
    });
    expect(army(pieces, 0).every((f) => f.armorRegen === 12.5)).toBe(true);
  });
  it.each([2, 4])(
    "%i装甲逐步恢复保留小数，记录实际自疗，满血不累计，阵亡不复活",
    (count) => {
      const b = simulate(line(armorIds.slice(0, count)), [
        { ...p("turtle", 101), star: 3 },
        { ...p("birdrider", 102, 51), star: 3 },
      ]);
      const rate = count === 2 ? 3.75 : 12.5;
      expect(
        b.frames[0].fighters
          .filter((f) => f.side === 0)
          .every((f) => f.healing === 0),
      ).toBe(true);
      let increments = 0,
        deaths = 0;
      for (let i = 1; i < b.frames.length; i++)
        for (const old of b.frames[i - 1].fighters.filter(
          (f) => f.side === 0,
        )) {
          const now = b.frames[i].fighters.find((f) => f.uid === old.uid)!;
          expect(now.hp).toBeLessThanOrEqual(now.maxHp);
          if (old.hp <= 0) {
            expect(now.hp).toBe(0);
            deaths++;
            continue;
          }
          const healed = now.healing - old.healing;
          if (
            old.hp === old.maxHp &&
            !b.frames[i].events.some((e) => e.target === old.uid)
          )
            expect(healed).toBe(0);
          // A unit can die before its turn; only actual restoration is credited.
          expect(healed).toBeGreaterThanOrEqual(0);
          expect(healed).toBeLessThanOrEqual(rate);
          if (healed === rate) increments++;
        }
      expect(increments).toBeGreaterThan(0);
      expect(b.frames.at(-1)!.fighters.some((f) => f.healing > 0)).toBe(true);
      // The separate low-health side is intentionally allowed to lose; no resurrection.
      expect(deaths).toBeGreaterThan(0);
    },
  );
  it.each([
    [2, 0],
    [3, 0.2],
    [5, 0.2],
    [6, 0.5],
  ])("%i种爆破降低敌方法术减伤%s，双向独立且含非爆破目标", (count, amount) => {
    const b = simulate(
      line(blastIds.slice(0, count)),
      line(["irondog", "ironape", "motorcycle", "turtle"], 100),
    );
    for (const f of b.frames[0].fighters) {
      const reduction = f.side === 0 ? 0.2 : amount;
      expect(f.air!.magicBreak).toBe(reduction);
      expect(f.magicResist).toBeCloseTo(Math.max(-0.25, 0.2 - reduction));
    }
  });
  it("旧lineages六爆破受最低减伤限制，召唤防御和装备先叠加；普攻物理与真伤不放大", () => {
    const initial = simulate(
      left,
      [
        ...line(["wolf", "adept", "shark"], 100),
        { ...p("turtle", 110, 60), items: ["fortress"] },
      ],
      "lineages",
    ).frames[0];
    const a = initial.fighters.find((f) => f.side === 0)!;
    const target = initial.fighters.find((f) => f.defId === "wolf")!;
    expect(target.summonWard).toBe(0.25);
    expect(
      initial.fighters.find((f) => f.uid === 110)!.magicResist,
    ).toBeCloseTo(-0.05);
    expect(target.magicResist).toBeCloseTo(-0.15);
    const ctx: CombatContext = {
      fighters: [a, target],
      tick: 1,
      events: [],
      effects: [],
    };
    const hit = (kind: "magic" | "physical" | "true", resist: number) => {
      target.hp = target.maxHp;
      target.shield = 0;
      target.magicResist = resist;
      return damage(ctx, a, target, 100, kind, true);
    };
    expect(hit("magic", -0.25)).toBe(125);
    expect(hit("magic", -0.15)).toBe(115);
    expect(hit("true", -0.25)).toBe(100);
    expect(hit("physical", -0.25)).toBe(hit("physical", 0.2));
  });
  it("旧lineages后续幼狼与傀儡继承爆破及召唤防御，不继承装甲再生", () => {
    const fighters = simulate(left, right, "lineages").frames[0].fighters;
    const ctx: CombatContext = { fighters, tick: 10, events: [], effects: [] };
    const wolf = fighters.find((f) => f.defId === "wolf")!,
      adept = fighters.find((f) => f.defId === "adept")!;
    wolf.mana = adept.mana = 100;
    expect(callWolfPack(ctx, wolf)).toBe(true);
    expect(callRetinue(ctx, adept)).toBe(true);
    const summons = fighters.filter((f) => f.summon);
    expect(summons.length).toBeGreaterThanOrEqual(3);
    for (const f of summons) {
      expect(f.air!.magicBreak).toBe(0.6);
      expect(f.magicResist).toBeCloseTo(-0.15);
      expect(f.regeneration).toBe(0);
      expect(f.armorRegen).toBeUndefined();
    }
  });
  it("减抗与再生不随提供者阵亡而消失，战斗结束后不改变永久棋子", () => {
    const before = structuredClone([left, right]),
      b = simulate(left, right);
    expect(
      b.frames
        .at(-1)!
        .fighters.filter((f) => f.side === 1)
        .every((f) => f.air!.magicBreak === 0.5),
    ).toBe(true);
    expect([left, right]).toEqual(before);
    for (const f of b.frames
      .at(-1)!
      .fighters.filter((f) => armorIds.includes(f.defId)))
      expect(f.armorRegen).toBe(12.5);
  });
  it("图鉴与备战说明按版本显示，旧infantry依然为护甲和10点减抗", () => {
    const current = pieceDetails(p("ironape", 1));
    expect(
      current.traits.find((t) => t.name === "装甲")!.description,
    ).toContain("每秒恢复 50");
    expect(
      current.traits.find((t) => t.name === "爆破")!.description,
    ).toContain("降低 50");
    expect(
      pieceDetails(p("ironape", 1), "infantry").traits.find(
        (t) => t.name === "装甲",
      )!.description,
    ).toContain("护甲 +6");
    expect(codexMarkup()).toMatch(/最低\s*−25%/);
    const old = simulate(left, right, "infantry").frames[0].fighters;
    expect(old.find((f) => f.defId === "ironape")!.armor).toBe(12);
    expect(old.every((f) => f.armorRegen === undefined)).toBe(true);
    expect(old.find((f) => f.side === 1)!.air!.magicBreak).toBe(0.1);
  });
  it("快速结算、完整回放、Worker结果一致", () => {
    const b = simulate(left, right),
      fast = simulateOutcome(left, right);
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect([fast.winner, fast.damage]).toEqual([b.winner, b.damage]);
    expect(
      compute({
        kind: "replay",
        left,
        right,
        version: CURRENT_COMBAT_VERSION,
      }),
    ).toEqual({ kind: "replay", battle: b });
  });
});
describe("0.28已发出战报冻结", () => {
  for (const f of frozen.fixtures)
    it(`${f.name}完整逐帧SHA保持一致`, async () => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(simulate(f.left, f.right, "infantry")),
        ),
      );
      expect(
        Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(f.hash);
    });
});
describe("0.28存档升级", () => {
  it.each(["prepare", "battle", "result", "finished"] as const)(
    "%s阶段保留既有经济、AI风格及旧战报，到准备阶段切换",
    (phase) => {
      const g = createGame(137, "classic");
      g.combatVersion = "infantry";
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
      const before = structuredClone(g);
      const decoded = decodeSave(
        JSON.stringify({
          schema: 27,
          rules: "singleplayer-0.28",
          game: g,
          savedAt: 1,
          revision: 1,
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
          phase === "prepare" ? CURRENT_COMBAT_VERSION : "infantry",
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
        expect(h.combatVersion).toBe("infantry");
        expect(simulate(h.left, h.right, h.combatVersion)).toEqual(
          result!.battle,
        );
      }
      expect(validGame(restored)).toBe(true);
    },
  );
});
