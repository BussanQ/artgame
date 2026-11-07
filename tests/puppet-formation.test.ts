import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { synergies } from "../src/engine/synergies";
import {
  callRetinue,
  callWolfPack,
  RETINUE,
  SPIRIT_WOLF,
} from "../src/engine/summons";
import { traitTiers } from "../src/data/traits";
import { UNIT, RULES } from "../src/data/units";
import { skillDescription } from "../src/data/skills";
import {
  createGame,
  buy,
  move,
  startRound,
  settle,
  resumeRound,
  nextRound,
} from "../src/engine/game";
import { claimReward } from "../src/engine/equipment";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import {
  isRecruitable,
  rotationTraits,
  type Series,
} from "../src/engine/rotation";
import { pieceDetails } from "../src/ui/bench-tooltip";
import { codexMarkup } from "../src/ui/unit-codex";
import { rotationMarkup } from "../src/ui/rotation";
import { compute } from "../src/compute/job";
import {
  CURRENT_COMBAT_VERSION,
  type Piece,
  type Game,
} from "../src/engine/types";
import type { CombatContext } from "../src/engine/abilities";
import { SHIELDTHRALL_DEMO } from "../src/data/shieldthrall-demo";
import frozen from "./fixtures/pre-v036-replays.json";

const ids = [
  "adept",
  "shark",
  "axethrall",
  "swordthrall",
  "bladethrall",
  "shieldthrall",
];
const line = (units = ids, offset = 0): Piece[] =>
  units.map((defId, i) => ({
    uid: offset + i + 1,
    defId,
    star: 1,
    position: 32 + i,
  }));
const context = (pieces: Piece[]): CombatContext => ({
  fighters: army(pieces, 0),
  tick: 10,
  effects: [],
  events: [],
});

describe("傀儡2/4/6梯度", () => {
  it.each([
    [1, 0, 0],
    [2, 0.1, 1],
    [3, 0.1, 1],
    [4, 0.25, 2],
    [5, 0.25, 2],
    [6, 0.45, 3],
  ])("%i种成员：累计自身攻击倍率%s、档位%i", (count, ratio, tier) => {
    const pieces = [...line(ids.slice(0, count)), ...line(["infantry"], 100)];
    pieces.at(-1)!.position = 48;
    const synergy = synergies(pieces).find((s) => s.trait === "傀儡")!;
    expect(synergy.tiers).toEqual([2, 4, 6]);
    expect(synergy.tier).toBe(tier);
    for (const fighter of army(pieces, 0)) {
      const puppet = UNIT[fighter.defId].traits.includes("傀儡");
      expect(fighter.attack).toBeCloseTo(
        UNIT[fighter.defId].attack *
          (1 + (puppet ? ratio : count === 6 ? 0.2 : 0)),
      );
      expect(fighter.teamAttack).toBe(count === 6 ? 0.2 : undefined);
    }
  });
  it("同名高星和备战席不凑六种，六档傀儡累计45%、团队20%", () => {
    const pieces = line();
    const original = structuredClone(pieces);
    expect(
      army(pieces, 0).every((f) => f.attack === UNIT[f.defId].attack * 1.45),
    ).toBe(true);
    pieces.at(-1)!.position = null;
    pieces.push({ ...pieces[0], uid: 99, star: 3, position: 49 });
    const s = synergies(pieces).find((s) => s.trait === "傀儡")!;
    expect(s.count).toBe(5);
    expect(s.tier).toBe(2);
    expect(army(pieces, 0).every((f) => !f.teamAttack)).toBe(true);
    expect(line()).toEqual(original);
  });
  it("全队加成包含攻击装备和非傀儡，只影响本方，开战快照不改永久棋子", () => {
    const pieces = [...line(), ...line(["infantry"], 100)];
    pieces.at(-1)!.position = 48;
    pieces.at(-1)!.items = ["warblade"];
    pieces[0].items = ["blade"];
    pieces[0].star = 2;
    const before = structuredClone(pieces),
      fighters = army(pieces, 0);
    expect(fighters[0].attack).toBeCloseTo((UNIT.adept.attack * 2 + 18) * 1.45);
    expect(fighters.at(-1)!.attack).toBeCloseTo(
      (UNIT.infantry.attack + 50) * 1.2,
    );
    const enemy = army(line(["infantry"], 200), 1)[0];
    expect(enemy.teamAttack).toBeUndefined();
    expect(enemy.attack).toBe(UNIT.infantry.attack);
    fighters[0].hp = 0;
    expect(fighters[1].teamAttack).toBe(0.2);
    expect(pieces).toEqual(before);
  });
  it.each([2, 4, 6])(
    "%i档真人和须弥鲨召唤：只继承六档团队攻击，不继承主人攻击装备",
    (count) => {
      const pieces = line(ids.slice(0, count));
      for (const piece of pieces.slice(0, 2)) {
        piece.star = 2;
        piece.items = ["warblade", "staff"];
      }
      const ctx = context(pieces);
      for (const id of ["adept", "shark"]) {
        const owner = ctx.fighters.find((f) => f.defId === id)!;
        owner.mana = 100;
        expect(callRetinue(ctx, owner)).toBe(true);
        const summoned = ctx.fighters.filter(
          (f) => f.summon?.owner === owner.uid,
        );
        expect(summoned.length).toBe(id === "adept" ? 1 : 2);
        const base =
          id === "adept" ? RETINUE.puppet.attack : RETINUE.sentinel.attack;
        for (const fighter of summoned) {
          expect(fighter.attack).toBe(
            Math.round(base * 2 * 1.3 * (count === 6 ? 1.2 : 1)),
          );
          expect(fighter.teamAttack).toBe(count === 6 ? 0.2 : undefined);
        }
      }
    },
  );
  it("非傀儡鬼狼和后续幼狼也享受六档，召唤者死亡不撤回已生成幼狼的加成", () => {
    const pieces = [...line(), ...line(["wolf"], 100)];
    pieces.at(-1)!.position = 48;
    const ctx = context(pieces),
      wolf = ctx.fighters.find((f) => f.defId === "wolf")!;
    wolf.mana = 100;
    // Two assassins no longer add flat attack; only six-puppet team attack applies.
    expect(wolf.attack).toBeCloseTo(UNIT.wolf.attack * 1.2);
    expect(wolf.assassinCrit).toBeUndefined();
    expect(callWolfPack(ctx, wolf)).toBe(true);
    const pups = ctx.fighters.filter((f) => f.summon?.owner === wolf.uid);
    expect(pups).toHaveLength(2);
    expect(
      pups.every((f) => f.attack === Math.round(SPIRIT_WOLF.attack * 1.2)),
    ).toBe(true);
    wolf.hp = 0;
    expect(pups.every((f) => f.teamAttack === 0.2 && f.hp > 0)).toBe(true);
  });
  it("旧armored继续两种15%一档，不接受新全队攻击或召唤增益", () => {
    const pieces = [...line(), ...line(["wolf"], 100)];
    pieces.at(-1)!.position = 48;
    const ctx: CombatContext = {
      fighters: army(pieces, 0, "armored"),
      tick: 10,
      effects: [],
      events: [],
    };
    expect(traitTiers("armored").傀儡.map((t) => t.count)).toEqual([2]);
    expect(ctx.fighters.every((f) => !f.teamAttack)).toBe(true);
    expect(ctx.fighters.find((f) => f.defId === "adept")!.attack).toBeCloseTo(
      UNIT.adept.attack * 1.15,
    );
    const wolf = ctx.fighters.find((f) => f.defId === "wolf")!;
    expect(wolf.attack).toBeCloseTo(UNIT.wolf.attack * 1.2);
    wolf.mana = 100;
    callWolfPack(ctx, wolf);
    expect(
      ctx.fighters
        .filter((f) => f.summon)
        .every((f) => f.attack === SPIRIT_WOLF.attack),
    ).toBe(true);
  });
  it("联合禁用海神与灵能后六档不可达，图鉴、备战说明与旧版本提示一致", () => {
    const game = {
      bannedSeries: ["海神", "灵能", "熊猫"] as Series[],
      combatVersion: CURRENT_COMBAT_VERSION,
    };
    expect(rotationTraits(game).find((t) => t.trait === "傀儡")).toMatchObject({
      available: 5,
      total: 7,
      tiers: [2, 4, 6],
    });
    expect(rotationMarkup(game)).toContain("6档不可达");
    expect(
      rotationTraits({ ...game, combatVersion: "armored" }).find(
        (t) => t.trait === "傀儡",
      )?.tiers,
    ).toEqual([2]);
    expect(
      pieceDetails(line()[0]).traits.find((t) => t.name === "傀儡")
        ?.description,
    ).toContain("6 个：傀儡攻击 +45%");
    expect(codexMarkup(game)).toContain("6 个不同棋子：傀儡攻击 +45%");
    expect(codexMarkup({ ...game, combatVersion: "armored" })).not.toContain(
      "6 个不同棋子：傀儡攻击 +45%",
    );
    expect(skillDescription("adept")).toContain("6档全队攻击对召唤物生效");
    expect(skillDescription("wolf")).toContain("6傀儡的全队攻击加成");
    expect(skillDescription("adept", "armored")).not.toContain("6档全队攻击");
  });
  it("六傀儡演示在新规则完整、快速与Worker一致，不叠人口和棋格", () => {
    const before = structuredClone(SHIELDTHRALL_DEMO),
      b = simulate(before.left, before.right);
    expect(
      b.frames[0].fighters
        .filter((f) => f.side === 0)
        .every((f) => f.teamAttack === 0.2),
    ).toBe(true);
    expect(
      b.frames.some((frame) =>
        frame.fighters.some((f) => f.summon && f.teamAttack === 0.2),
      ),
    ).toBe(true);
    for (const frame of b.frames) {
      const alive = frame.fighters.filter((f) => f.hp > 0);
      expect(new Set(alive.map((f) => `${f.x},${f.y}`)).size).toBe(
        alive.length,
      );
    }
    expect(simulateOutcome(before.left, before.right).final.fighters).toEqual(
      b.frames.at(-1)!.fighters,
    );
    expect(
      compute({
        kind: "replay",
        left: before.left,
        right: before.right,
        version: CURRENT_COMBAT_VERSION,
      }),
    ).toEqual({ kind: "replay", battle: b });
    expect(SHIELDTHRALL_DEMO).toEqual(before);
  });
  for (const fixture of frozen.fixtures)
    it(`0.35旧回放${fixture.name}逐帧不变`, async () => {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(simulate(fixture.left, fixture.right, "armored")),
        ),
      );
      expect(
        Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(fixture.hash);
    });
});

describe("傀儡梯度存档切换", () => {
  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`${banned}/${phase}只在准备阶段切换，历史和正在播放的战斗保留armored`, () => {
        const g = createGame(137, "classic");
        g.combatVersion = "armored";
        for (const player of g.players) {
          for (const id of player.shop) if (id) g.pool[id]++;
          player.shop = [null, null, null, null, null];
        }
        g.bannedSeries = (
          banned ? ["傀儡", "猛禽", "陆行者"] : ["装甲", "猛禽", "陆行者"]
        ) as Series[];
        for (const id of Object.keys(g.pool))
          if (!isRecruitable(g, id)) g.pool[id] = 0;
        const me = g.players[0];
        me.shop[0] = phase === "finished" ? "fish" : "guard";
        g.pool[me.shop[0]]--;
        buy(g, me, 0);
        move(g, me, me.pieces[0].uid, 35);
        if (phase === "finished") me.hp = 1;
        const result = phase === "prepare" ? null : startRound(g);
        if (phase === "result" || phase === "finished") settle(g, result!);
        expect(g.phase).toBe(phase);
        expect(validGame(g)).toBe(true);
        const before = structuredClone(g);
        const decoded = decodeSave(
          JSON.stringify({
            schema: 34,
            rules: "singleplayer-0.35",
            savedAt: 1,
            revision: 1,
            game: g,
            playback: { time: 4, speed: 2, paused: true },
          }),
        );
        expect(decoded.status).toBe("migrated");
        expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
        expect(decoded.data!.rules).toBe(RULES.version);
        const restored = decoded.data!.game;
        expect(restored).toEqual({
          ...before,
          combatVersion:
            phase === "prepare" ? CURRENT_COMBAT_VERSION : "armored",
        });
        expect(decoded.data!.playback).toEqual({
          time: 4,
          speed: 2,
          paused: true,
        });
        if (phase === "battle") {
          expect(resumeRound(restored)!.battle).toEqual(result!.battle);
          settle(restored, resumeRound(restored)!);
        }
        if (restored.phase === "result") {
          if (restored.reward) claimReward(restored, 0);
          nextRound(restored);
          expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
          expect(restored.history[0].combatVersion).toBe("armored");
        }
        expect(validGame(restored)).toBe(true);
      });
});
