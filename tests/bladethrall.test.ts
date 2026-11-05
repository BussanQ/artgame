import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { bladeStrike, seedBladeStrikes } from "../src/engine/bladethrall";
import {
  castSkill,
  damage,
  gainMana,
  type CombatContext,
} from "../src/engine/abilities";
import { skillReady, usesEnergy, skillGauge } from "../src/engine/triggers";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { battleAnalysisMarkup } from "../src/ui/battle-analysis";
import {
  createGame,
  buy,
  buyXp,
  roll,
  sell,
  move,
  startRound,
  settle,
  resumeRound,
} from "../src/engine/game";
import { prepareBot, abilityCredit } from "../src/engine/ai";
import { itemScore } from "../src/engine/equipment";
import { isRecruitable, type Series } from "../src/engine/rotation";
import { validGame, decodeSave, SAVE_SCHEMA } from "../src/engine/persistence";
import { COPIES, RULES, UNIT } from "../src/data/units";
import { skillDescription } from "../src/data/skills";
import { BLADETHRALL_DEMO } from "../src/data/bladethrall-demo";
import { compute } from "../src/compute/job";
import type { Game, Piece } from "../src/engine/types";
import frozen from "./fixtures/pre-v034-replays.json";

const p = (
  defId: string,
  uid: number,
  star = 1,
  position: number | null = 35,
): Piece => ({ defId, uid, star, position });
function setup(star = 1, uid = 101) {
  const source = Object.assign(army([p("bladethrall", uid, star)], 0)[0], {
    x: 3,
    y: 3,
  });
  const target = Object.assign(army([p("guard", 200, 3)], 1)[0], {
    x: 3,
    y: 2,
    hp: 1e8,
    maxHp: 1e8,
    armor: 0,
    magicResist: 0,
  });
  const ctx: CombatContext = {
    fighters: [source, target],
    tick: 10,
    effects: [],
    events: [],
  };
  return { source, target, ctx };
}
function untilCritical(s: ReturnType<typeof setup>) {
  for (let n = 0; n < 100; n++) {
    expect(bladeStrike(s.ctx, s.source, s.target)).toBe(true);
    const e = s.ctx.events
      .slice()
      .reverse()
      .find((e) => e.attacker === s.source.uid)!;
    if (e.empowered) return e;
  }
  throw Error("No critical in test sample");
}
const envelope = (g: Game, schema = SAVE_SCHEMA, rules = RULES.version) =>
  JSON.stringify({
    schema,
    rules,
    savedAt: 1,
    revision: 1,
    game: g,
    playback: { time: 2, speed: 2, paused: true },
  });
function clearShops(g: Game) {
  for (const q of g.players) {
    for (const id of q.shop) if (id) g.pool[id]++;
    q.shop = [null, null, null, null, null];
  }
}

describe("刀奴零时突进", () => {
  it.each([1, 2, 3])("%i星属性、倍率与被动无需能量", (star) => {
    const s = setup(star);
    expect(UNIT.bladethrall).toMatchObject({
      cost: 3,
      traits: ["傀儡", "先锋"],
      hp: 550,
      attack: 86,
      armor: 5,
      range: 1,
      interval: 5,
    });
    expect(s.source).toMatchObject({
      maxHp: 550 * 2 ** (star - 1),
      attack: 86 * 2 ** (star - 1),
      mana: 0,
      bladeCrit: { attempts: 0, crits: 0 },
    });
    const event = untilCritical(s);
    expect(event).toMatchObject({
      amount: 86 * 2 ** (star - 1) * [3, 4.5, 6][star - 1],
      skill: false,
      primary: true,
      ranged: false,
      empowered: true,
      damageType: "physical",
    });
    expect(s.source.bladeCrit).toEqual({ attempts: 7, crits: 1 });
    expect(
      s.ctx.events
        .slice(0, 6)
        .every((e) => e.amount === s.source.attack && !e.empowered),
    ).toBe(true);
    expect(s.ctx.effects.some((e) => e.kind === "cast")).toBe(false);
    expect(s.source.signature?.casts).toBe(0);
    gainMana(s.source, 100, 10);
    expect(s.source.mana).toBe(0);
    expect(skillReady(s.source)).toBe(false);
    expect(usesEnergy(s.source)).toBe(false);
    expect(skillGauge(s.source).progress).toBe(0);
    expect(skillDescription("bladethrall")).toMatch(/^被动/);
    s.source.mana = 100;
    const before = structuredClone(s.ctx);
    expect(castSkill(s.ctx, s.source, s.target)).toBe(false);
    expect(s.ctx).toEqual(before);
  });
  it("确定性独立攻击流、概率接近10%，不变成每十次保底", () => {
    let attacks = 0,
      crits = 0,
      emptyWindows = 0;
    const patterns: boolean[][] = [];
    for (let uid = 1; uid <= 128; uid++) {
      const s = setup(1, uid),
        pattern: boolean[] = [];
      for (let i = 0; i < 100; i++) {
        bladeStrike(s.ctx, s.source, s.target);
        pattern.push(!!s.ctx.events.at(-1)!.empowered);
      }
      attacks += s.source.bladeCrit!.attempts;
      crits += s.source.bladeCrit!.crits;
      for (let i = 0; i < 100; i += 10)
        emptyWindows += Number(pattern.slice(i, i + 10).every((v) => !v));
      patterns.push(pattern);
    }
    expect(crits / attacks).toBeGreaterThan(0.085);
    expect(crits / attacks).toBeLessThan(0.115);
    expect(emptyWindows).toBeGreaterThan(100);
    expect(new Set(patterns.map((p) => p.join())).size).toBeGreaterThan(120);
    const alone = setup(),
      interleaved = setup(),
      other = setup(1, 102);
    for (let i = 0; i < 40; i++) {
      bladeStrike(alone.ctx, alone.source, alone.target);
      bladeStrike(other.ctx, other.source, other.target);
      bladeStrike(interleaved.ctx, interleaved.source, interleaved.target);
    }
    expect(alone.ctx).toEqual(interleaved.ctx);
  });
  it("对阵种子随开场阵容变化，同一阵容仍逐次复现暴击", () => {
    const a = setup(),
      repeat = setup(),
      changed = setup();
    changed.target.maxHp += 100;
    for (const s of [a, repeat, changed]) {
      seedBladeStrikes(s.ctx.fighters);
      for (let i = 0; i < 100; i++) bladeStrike(s.ctx, s.source, s.target);
    }
    const pattern = (s: ReturnType<typeof setup>) =>
      s.ctx.events.map((e) => !!e.empowered);
    expect(a.ctx).toEqual(repeat.ctx);
    expect(pattern(a)).not.toEqual(pattern(changed));
  });
  it("真伤普攻仍能暴击，封能辅助不会给刀奴充能", () => {
    const s = setup();
    s.source.trueAttack = true;
    s.target.armor = 1000;
    expect(untilCritical(s)).toMatchObject({
      amount: 258,
      damageType: "true",
      skill: false,
    });
    const acolyte = army([p("acolyte", 9)], 0)[0];
    acolyte.x = 2;
    acolyte.y = 3;
    acolyte.mana = 100;
    s.ctx.fighters.push(acolyte);
    const mana = acolyte.mana;
    expect(castSkill(s.ctx, acolyte, s.target)).toBe(false);
    expect(acolyte.mana).toBe(mana);
    expect(s.source.mana).toBe(0);
  });
  it.each([
    "dead",
    "stun",
    "far",
    "ally",
    "concealed",
    "deadTarget",
    "summon",
    "otherUnit",
  ])("%s无合法普攻时不掷骰或产生伤害", (reason) => {
    const s = setup();
    if (reason === "dead") s.source.hp = 0;
    if (reason === "stun") s.source.stunUntil = 11;
    if (reason === "far") s.target.y = 0;
    if (reason === "ally") s.target.side = 0;
    if (reason === "concealed") s.target.air!.phaseUntil = 20;
    if (reason === "deadTarget") s.target.hp = 0;
    if (reason === "summon") s.source.summon = { owner: 9, born: 0 };
    if (reason === "otherUnit") s.source.defId = "guard";
    const before = structuredClone(s.ctx);
    expect(bladeStrike(s.ctx, s.source, s.target)).toBe(false);
    expect(s.ctx).toEqual(before);
  });
  it("沉默、封能、零能量不阻止暴击，被魅惑时可暴击原队友", () => {
    const s = setup(2);
    s.source.silenceUntil = 100;
    s.source.manaLockUntil = 100;
    s.source.charm = { until: 100, attack: s.source.attack, side: 0 };
    s.source.side = 1;
    s.target.side = 0;
    expect(untilCritical(s).amount).toBe(774);
    expect(s.source.mana).toBe(0);
  });
  it("暴击继承攻击装备、同类攻击强化取高，忽略技能强度和法术抗性", () => {
    const s = setup(2);
    s.source.attack += 50;
    s.source.skillPower = 9;
    s.target.magicResist = 0.9;
    s.source.attackBoost = { until: 30, ratio: 0.2 };
    s.source.command = [
      { source: 8, side: 0, until: 30, attack: 0.35, armor: 0 },
    ];
    expect(untilCritical(s).amount).toBe(Math.round((172 + 50) * 1.35 * 4.5));
  });
  it("护甲、普攻破甲、护盾、实际扣血吸血和反伤各结算一次", () => {
    const s = setup();
    s.target.armor = 10;
    s.source.attackShred = 4;
    for (let i = 0; i < 6; i++) bladeStrike(s.ctx, s.source, s.target);
    s.ctx.events = [];
    s.source.hp = 100;
    s.source.lifesteal = 0.5;
    s.target.shield = 100;
    s.target.reflection = 25;
    bladeStrike(s.ctx, s.source, s.target);
    const total = Math.round((258 * 100) / 136),
      actual = total - 100;
    expect(s.ctx.events[0]).toMatchObject({
      amount: actual,
      absorbed: 100,
      empowered: true,
      skill: false,
    });
    expect(s.target.armorBreak).toBe(4);
    expect(s.target.shield).toBe(0);
    expect(s.source.hp).toBe(100 + Math.round(actual * 0.5) - 25);
    expect(s.ctx.events).toHaveLength(2);
    expect(s.source.bladeCrit).toEqual({ attempts: 7, crits: 1 });
  });
  it("暴击被闪避仍消耗一次判定，不穿透不朽；刀奴技能免伤目标仍受普攻", () => {
    const dodge = setup();
    for (let i = 0; i < 6; i++)
      bladeStrike(dodge.ctx, dodge.source, dodge.target);
    Object.assign(dodge.target.air!, { flying: true, evasion: 1 });
    const hp = dodge.target.hp;
    bladeStrike(dodge.ctx, dodge.source, dodge.target);
    expect(dodge.ctx.events.at(-1)).toMatchObject({
      empowered: true,
      evaded: true,
      amount: 0,
    });
    expect(dodge.target.hp).toBe(hp);
    expect(dodge.source.bladeCrit!.crits).toBe(1);
    const immune = setup();
    immune.target.immortal = { duration: 8, until: 50, spent: true };
    expect(untilCritical(immune)).toMatchObject({ immune: true, amount: 0 });
    const sword = setup();
    sword.target.bladeStorm = { until: 50, next: 14, remaining: 6, damage: 50 };
    expect(untilCritical(sword).amount).toBe(258);
  });
  it("完全破盾及致死只统计实际扣血，反伤可杀死刀奴且不额外出刀", () => {
    const s = setup();
    for (let i = 0; i < 6; i++) bladeStrike(s.ctx, s.source, s.target);
    s.ctx.events = [];
    s.target.hp = 50;
    s.target.shield = 10;
    s.target.reflection = 100;
    s.source.hp = 25;
    const before = s.source.damage;
    bladeStrike(s.ctx, s.source, s.target);
    expect(s.ctx.events[0]).toMatchObject({
      amount: 50,
      absorbed: 10,
      empowered: true,
    });
    expect(s.source.damage - before).toBe(50);
    expect(s.source.hp).toBe(0);
    expect(s.target.hp).toBe(0);
    const n = s.ctx.events.length;
    expect(bladeStrike(s.ctx, s.source, s.target)).toBe(false);
    expect(s.ctx.events).toHaveLength(n);
  });
  it("回合重建清零随机计数，技能回能装备无效，攻击/攻速装备有价值", () => {
    const piece = p("bladethrall", 101, 2);
    piece.items = ["staff", "crystal", "overdrive"];
    const f = army([piece], 0)[0];
    expect(f.mana).toBe(0);
    expect(f.interval).toBe(3.75);
    expect(f.bladeCrit).toEqual({ attempts: 0, crits: 0 });
    expect(itemScore(piece, "staff")).toBe(0);
    expect(itemScore(piece, "crystal")).toBe(0);
    expect(itemScore(piece, "blade")).toBeGreaterThan(18);
    expect(itemScore(piece, "overdrive")).toBeGreaterThan(0);
    expect(abilityCredit(piece)).toBeCloseTo(0.35);
    expect(abilityCredit({ ...piece, items: [] })).toBe(abilityCredit(piece));
    const s = setup();
    untilCritical(s);
    expect(army([piece], 0)[0].bladeCrit).toEqual({ attempts: 0, crits: 0 });
  });
  it("完整模拟和快速/Worker一致，战报暴击仍归普攻，查看片段不泄露未来", () => {
    const before = structuredClone(BLADETHRALL_DEMO),
      b = simulate(before.left, before.right, "wildfront");
    const attacks = b.frames.flatMap((fr) =>
      fr.events.filter((e) => e.attacker === 101),
    );
    expect(attacks.length).toBeGreaterThan(10);
    expect(attacks.filter((e) => e.empowered)).toHaveLength(2);
    expect(attacks.every((e) => !e.skill)).toBe(true);
    const last = b.frames.at(-1)!.fighters.find((f) => f.uid === 101)!;
    expect(last.bladeCrit!.attempts).toBe(attacks.length);
    expect(last.damage).toBe(attacks.reduce((n, e) => n + e.amount, 0));
    const a = analyzeBattle(b),
      row = a.sides[0].fighters.find((f) => f.uid === 101)!;
    expect(row).toMatchObject({
      criticalHits: 2,
      casts: 0,
      skillDamage: 0,
      normalDamage: last.damage,
    });
    expect(
      battleAnalysisMarkup(
        a,
        "damage",
        "傀儡战刃",
        b.frames.length - 1,
        b.frames.at(-1)!.tick,
      ),
    ).toContain("暴击命中 2 次");
    const first = b.frames.findIndex((fr) =>
      fr.events.some((e) => e.attacker === 101 && e.empowered),
    );
    expect(
      analyzeBattle(b, first - 1).sides[0].fighters.find((f) => f.uid === 101)!
        .criticalHits,
    ).toBe(0);
    for (const fr of b.frames) {
      const alive = fr.fighters.filter((f) => f.hp > 0);
      expect(new Set(alive.map((f) => `${f.x},${f.y}`)).size).toBe(
        alive.length,
      );
    }
    expect(
      simulateOutcome(before.left, before.right, "wildfront").final.fighters,
    ).toEqual(b.frames.at(-1)!.fighters);
    expect(
      compute({
        kind: "replay",
        left: before.left,
        right: before.right,
        version: "wildfront",
      }),
    ).toEqual({ kind: "replay", battle: b });
    expect(BLADETHRALL_DEMO).toEqual(before);
  });
  it("正常三合一、出售守恒及AI招募部署", () => {
    const g = createGame(91, "classic"),
      me = g.players[0];
    clearShops(g);
    for (let i = 0; i < 3; i++) {
      me.shop[0] = "bladethrall";
      g.pool.bladethrall--;
      expect(buy(g, me, 0)).toBe(true);
    }
    expect(me.gold).toBe(1);
    expect(me.pieces[0].star).toBe(2);
    expect(validGame(g)).toBe(true);
    sell(g, me, me.pieces[0].uid);
    expect(g.pool.bladethrall).toBe(COPIES[3]);
    const bot = g.players[1];
    bot.gold = 3;
    bot.shop[0] = "bladethrall";
    g.pool.bladethrall--;
    prepareBot(g, bot, { buy, sell, roll, buyXp });
    expect(
      bot.pieces.some((p) => p.defId === "bladethrall" && p.position !== null),
    ).toBe(true);
    expect(bot.gold).toBe(0);
    expect(validGame(g)).toBe(true);
  });
  for (const fixture of frozen.fixtures)
    it(`0.33旧回放${fixture.name}逐帧不变`, async () => {
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

describe("刀奴禁用感知迁移", () => {
  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`${banned}/${phase}旧0.33只补刀奴卡池`, () => {
        const g = createGame(137, "classic"),
          me = g.players[0];
        clearShops(g);
        g.bannedSeries = (
          banned ? ["傀儡", "猛禽", "陆行者"] : ["装甲", "猛禽", "陆行者"]
        ) as Series[];
        for (const id of Object.keys(g.pool))
          if (!isRecruitable(g, id)) g.pool[id] = 0;
        me.shop[0] = phase === "finished" ? "fish" : "guard";
        g.pool[me.shop[0]]--;
        buy(g, me, 0);
        move(g, me, me.pieces[0].uid, 35);
        if (phase === "finished") me.hp = 1;
        if (phase !== "prepare") g.combatVersion = "armored";
        let result: ReturnType<typeof startRound> = null;
        if (phase !== "prepare") {
          result = startRound(g);
          if (phase !== "battle") settle(g, result!);
        }
        for (const q of g.players) {
          q.shop = q.shop.map((id) => (id === "bladethrall" ? null : id));
          q.pieces = q.pieces.filter((p) => p.defId !== "bladethrall");
        }
        g.pool.bladethrall = banned ? 0 : COPIES[3];
        expect(g.phase).toBe(phase);
        expect(validGame(g)).toBe(true);
        delete g.pool.bladethrall;
        const before = structuredClone(g),
          d = decodeSave(envelope(g, 32, "singleplayer-0.33"));
        expect(d.status).toBe("migrated");
        expect(d.data!.game).toEqual({
          ...before,
          pool: { ...before.pool, bladethrall: banned ? 0 : COPIES[3] },
        });
        expect(validGame(d.data!.game)).toBe(true);
        expect(d.data!.playback).toEqual({ time: 2, speed: 2, paused: true });
        if (phase === "battle")
          expect(resumeRound(d.data!.game)!.battle).toEqual(result!.battle);
      });
});
