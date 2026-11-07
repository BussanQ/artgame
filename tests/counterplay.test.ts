import { COUNTERPLAY_DEMO } from "../src/data/counterplay-demo";
import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  damage,
  gainMana,
  recoveredMana,
  castSkill,
  type CombatContext,
} from "../src/engine/abilities";
import { synergies } from "../src/engine/synergies";
import { callWolfPack, callRetinue } from "../src/engine/summons";
import { enterPhoenixEgg, hatchPhoenix } from "../src/engine/phoenix";
import { traitTiers } from "../src/data/traits";
import { RULES, UNIT, UNITS } from "../src/data/units";
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
  settle,
  resumeRound,
  nextRound,
} from "../src/engine/game";
import { claimReward } from "../src/engine/equipment";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import { isRecruitable } from "../src/engine/rotation";
import { compute } from "../src/compute/job";
import { WILDFRONT_DEMO } from "../src/data/wildfront-demo";
import { ASSASSIN_DEMO } from "../src/data/assassin-demo";
import frozen from "./fixtures/pre-v044-replays.json";

const line = (ids: string[], offset = 0): Piece[] =>
  ids.map((defId, i) => ({
    defId,
    uid: offset + i + 1,
    star: 1,
    position: 32 + i,
  }));
const fighter = (id: string, side: 0 | 1 = 0) =>
  army(line([id], side * 100), side)[0];
const context = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 1,
  effects: [],
  events: [],
});
const snipers = UNITS.filter((u) => u.traits.includes("狙击")).map((u) => u.id);

describe("狙击护甲穿透", () => {
  it.each([
    [1, 0],
    [2, 0],
    [3, 4],
    [5, 4],
    [6, 12],
    [8, 12],
  ])("%i种狙击累计甲穿%i，不再平添攻击或修改敌人破甲", (count, penetration) => {
    const pieces = line(snipers.slice(0, count));
    const f = army(pieces, 0);
    expect(synergies(pieces).find((s) => s.trait === "狙击")?.tiers).toEqual([
      3, 6,
    ]);
    for (const unit of f) {
      expect(unit.armorPenetration ?? 0).toBe(penetration);
      expect(unit.attackShred).toBe(0);
      expect(unit.attack).toBe(UNIT[unit.defId].attack);
    }
  });
  it("甲穿只用于该狙击的物理伤害，支持物理技能、技能百分比穿透和敌方护甲增益", () => {
    const source = army(line(snipers.slice(0, 6)), 0)[0];
    function hit(
      type: "physical" | "magic" | "true",
      skill = false,
      percent = 0,
    ) {
      const target = fighter("guard", 1);
      Object.assign(target, { armor: 20, shield: 0, magicResist: 0.2 });
      const result = damage(
        context(source, target),
        source,
        target,
        100,
        type,
        skill,
        true,
        percent,
      );
      expect(target.armorBreak).toBe(0);
      return result;
    }
    expect(hit("physical")).toBe(68);
    expect(hit("physical", true)).toBe(68);
    expect(hit("physical", true, 0.5)).toBe(81);
    expect(hit("magic", true)).toBe(80);
    expect(hit("true")).toBe(100);
    const target = fighter("guard", 1),
      ally = fighter("guard");
    Object.assign(target, { armor: 20, shield: 0 });
    expect(damage(context(ally, target), ally, target, 100)).toBe(45);
    Object.assign(target, {
      armor: 10,
      shield: 0,
      armorBuff: 10,
      armorBuffUntil: 10,
      armorBreak: 3,
      armorBreakUntil: 10,
      infantryArmorBreak: 3,
    });
    expect(damage(context(source, target), source, target, 100)).toBe(89);
  });
  it("同名高星与备战不凑第三种，召唤物不继承狙击的穿甲", () => {
    const pieces = line(snipers.slice(0, 3));
    pieces[2].position = null;
    pieces.push({ ...pieces[0], uid: 99, star: 3, position: 60 });
    expect(army(pieces, 0).every((f) => !f.armorPenetration)).toBe(true);
    const source = fighter("wolf");
    source.armorPenetration = 12;
    source.mana = 100;
    const ctx = context(source);
    expect(callWolfPack(ctx, source)).toBe(true);
    expect(
      ctx.fighters
        .filter((f) => f.summon)
        .every((f) => f.armorPenetration === undefined),
    ).toBe(true);
  });
});

describe("骑兵回能压制", () => {
  const left = line(["birdrider", "motorcycle", "spider", "grenadier"]);
  it("0.44两种骑兵对敌方全军生效，不改初始能量，不再附赠普攻破甲", () => {
    const right = line(["infantry", "repair"], 100);
    const battle = simulate(left, right, "counterplay");
    const frame = battle.frames[0];
    expect(
      frame.fighters.filter((f) => f.side === 0).every((f) => !f.energyPenalty),
    ).toBe(true);
    for (const f of frame.fighters.filter((f) => f.side === 1)) {
      expect(f.energyPenalty).toBe(3);
      expect(f.energyMultiplier).toBe(0.75);
      expect(f.mana).toBe(army(right, 1).find((v) => v.uid === f.uid)!.mana);
    }
    expect(
      frame.fighters
        .filter((f) => f.defId === "birdrider" || f.defId === "motorcycle")
        .every((f) => f.attackShred === 0),
    ).toBe(true);
    const one = simulate(left.slice(0, 1), right).frames[0];
    expect(one.fighters.every((f) => !f.energyPenalty)).toBe(true);
  });
  it("普攻/受击/支援/充能统一倍率后扣除，零值、封能、被动与死亡有边界", () => {
    const f = simulate(
      left,
      line(["infantry"], 100),
      "counterplay",
    ).frames[0].fighters.find((f) => f.side === 1)!;
    f.mana = 0;
    gainMana(f, 25, 1);
    expect(f.mana).toBe(15.75);
    const source = fighter("guard");
    damage(context(source, f), source, f, 1, "true", true);
    expect(f.mana).toBe(20.25);
    expect(recoveredMana(f, 3)).toBe(0);
    gainMana(f, 0, 1);
    expect(f.mana).toBe(20.25);
    f.manaLockUntil = 10;
    gainMana(f, 50, 1);
    expect(f.mana).toBe(20.25);
    f.manaLockUntil = 0;
    f.hp = 0;
    gainMana(f, 50, 1);
    expect(f.mana).toBe(20.25);
    const passive = fighter("birdrider");
    passive.energyPenalty = 3;
    gainMana(passive, 50, 1);
    expect(passive.mana).toBe(0);
  });
  it("后生召唤物继承敌方压制，仍不能自行获取能量", () => {
    for (const id of ["wolf", "adept", "shark"]) {
      const source = fighter(id);
      source.energyPenalty = 3;
      source.mana = 100;
      const ctx = context(source);
      expect(
        id === "wolf" ? callWolfPack(ctx, source) : callRetinue(ctx, source),
      ).toBe(true);
      for (const child of ctx.fighters.filter((f) => f.summon)) {
        expect(child.energyPenalty).toBe(3);
        gainMana(child, 50, 1);
        expect(child.mana).toBe(0);
      }
    }
  });
});

describe("海神技能防御与飞行变化", () => {
  const sea = ["fish", "skycrab", "eel", "shark"];
  it.each([
    [1, 0],
    [2, 0.2],
    [3, 0.2],
    [4, 0.4],
  ])("%i海神给全部空中友军增加%s法术减伤，不再命中回蓝", (count, ward) => {
    const pieces = line([...sea.slice(0, count), "repair", "guard"]);
    const fighters = army(pieces, 0);
    for (const f of fighters) {
      expect(f.magicResist).toBeCloseTo(0.2 + (f.air?.flying ? ward : 0));
      expect(f.air?.seaMana).toBe(0);
    }
    const source = fighters.find((f) => f.defId === "repair")!,
      target = fighter("guard", 1);
    source.mana = 0;
    target.shield = 0;
    damage(context(source, target), source, target, 100, "magic", true);
    expect(source.mana).toBe(0);
  });
  it("上限先于爆破减抗；化蛋失去空中防御，孵化恢复，血鹰落地失效", () => {
    const pieces = line([...sea, "adept", "wolf", "phoenix", "bloodhawk"]);
    pieces[6].star = 2;
    pieces[6].items = ["fortress", "fortress"];
    const blast = UNITS.filter((u) => u.traits.includes("爆破"))
      .slice(0, 6)
      .map((u) => u.id);
    const all = simulate(pieces, line(blast, 100)).frames[0].fighters;
    const phoenix = all.find((f) => f.defId === "phoenix")!,
      hawk = all.find((f) => f.defId === "bloodhawk")!;
    expect(phoenix.magicResist).toBeCloseTo(0.25);
    expect(phoenix.air!.seaBaseResist).toBeCloseTo(0.4);
    phoenix.hp = 0;
    const ctx = context(...all);
    expect(enterPhoenixEgg(ctx, phoenix)).toBe(true);
    expect(phoenix.magicResist).toBeCloseTo(-0.1);
    ctx.tick = phoenix.phoenix!.eggUntil;
    hatchPhoenix(ctx);
    expect(phoenix.magicResist).toBeCloseTo(0.25);
    Object.assign(hawk, { mana: 100, x: 3, y: 3 });
    const target = all.find((f) => f.side === 1)!;
    Object.assign(target, { x: 3, y: 2 });
    expect(castSkill(ctx, hawk, target)).toBe(true);
    expect(hawk.air!.flying).toBe(false);
    expect(hawk.magicResist).toBeCloseTo(-0.25);
  });
});

describe("灵能同期总量与旧表", () => {
  it("两灵能全军20、四灵能全军50，真实受击仍扣血", () => {
    const ids = ["acolyte", "stormcaller", "thunderlord", "adept"];
    for (const count of [2, 4]) {
      const team = army(line([...ids.slice(0, count), "guard"]), 0);
      expect(team.every((f) => f.reflection === (count === 2 ? 20 : 50))).toBe(
        true,
      );
      const target = team.at(-1)!,
        source = fighter("guard", 1);
      target.shield = 0;
      const before = target.hp;
      damage(context(source, target), source, target, 100, "true", true);
      expect(target.hp).toBe(before - 100);
      expect(source.hp).toBe(source.maxHp - (count === 2 ? 20 : 50));
    }
    const old = traitTiers("formations"),
      now = traitTiers(CURRENT_COMBAT_VERSION);
    expect(old.灵能.map((t) => t.bonus.reflection)).toEqual([20, 30]);
    expect(now.灵能.map((t) => t.bonus.reflection)).toEqual([20, 50]);
    expect(old.狙击.map((t) => t.count)).toEqual([2, 4]);
    expect(old.海神[1].bonus.seaMana).toBe(20);
    expect(now.野兽).toEqual(old.野兽);
    expect(now.刺杀).toEqual(old.刺杀);
  });
  for (const [name, demo] of [
    ["狙骑反制", COUNTERPLAY_DEMO],
    ["荒原先锋", WILDFRONT_DEMO],
    ["六刺突袭", ASSASSIN_DEMO],
  ] as const)
    it(`${name}完整、快速和Worker结算一致`, () => {
      const b = simulate(demo.left, demo.right),
        fast = simulateOutcome(demo.left, demo.right);
      expect([fast.winner, fast.damage]).toEqual([b.winner, b.damage]);
      expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
      expect(
        compute({ kind: "replay", ...demo, version: CURRENT_COMBAT_VERSION }),
      ).toEqual({ kind: "replay", battle: b });
    });
});

describe("战术克制的存档边界", () => {
  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`${banned}/${phase}0.43仅准备期切换；保留资源、随机数、历史和播放`, () => {
        const game = createGame(137, "classic");
        game.combatVersion = "formations";
        for (const p of game.players) {
          for (const id of p.shop) if (id) game.pool[id]++;
          p.shop = [null, null, null, null, null];
        }
        if (banned) {
          game.bannedSeries = ["野兽", "海神", "空军"];
          for (const id of Object.keys(game.pool))
            if (!isRecruitable(game, id)) game.pool[id] = 0;
        }
        const me = game.players[0];
        me.shop[0] = phase === "finished" ? "medic" : "guard";
        game.pool[me.shop[0]]--;
        expect(buy(game, me, 0)).toBe(true);
        expect(move(game, me, me.pieces[0].uid, 35)).toBe(true);
        if (phase === "finished") me.hp = 1;
        const result = phase === "prepare" ? null : startRound(game);
        if (phase === "result" || phase === "finished") settle(game, result!);
        expect(game.phase).toBe(phase);
        const before = structuredClone(game);
        const decoded = decodeSave(
          JSON.stringify({
            schema: 42,
            rules: "singleplayer-0.43",
            savedAt: 1,
            revision: 1,
            game,
            playback: { time: 3, speed: 2, paused: true },
          }),
        );
        expect(decoded.status).toBe("migrated");
        expect(decoded.data).toMatchObject({
          schema: SAVE_SCHEMA,
          rules: RULES.version,
          playback: { time: 3, speed: 2, paused: true },
        });
        const restored = decoded.data!.game;
        expect(restored).toEqual({
          ...before,
          combatVersion:
            phase === "prepare" ? CURRENT_COMBAT_VERSION : "formations",
        });
        if (phase === "battle") {
          expect(resumeRound(restored)!.battle).toEqual(result!.battle);
          settle(restored, resumeRound(restored)!);
        }
        if (restored.phase === "result") {
          if (restored.reward) claimReward(restored, 0);
          nextRound(restored);
          expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
          expect(restored.history[0].combatVersion).toBe("formations");
        }
        expect(validGame(restored)).toBe(true);
      });

  for (const entry of frozen.fixtures)
    it(`0.43旧回放${entry.name}保持修改前逐帧哈希`, async () => {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(simulate(entry.left, entry.right, "formations")),
        ),
      );
      expect(
        Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(entry.hash);
    });
});
