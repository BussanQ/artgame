import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  gainMana,
  type CombatContext,
} from "../src/engine/abilities";
import { deathSongCells, inDeathSong } from "../src/engine/lingjiu";
import { startBladeStorm } from "../src/engine/swordthrall";
import { skillGauge, usesEnergy } from "../src/engine/triggers";
import { abilityCredit, prepareBot } from "../src/engine/ai";
import { itemScore } from "../src/engine/equipment";
import { analyzeBattle } from "../src/engine/battle-analysis";
import {
  createGame,
  buy,
  sell,
  roll,
  buyXp,
  move,
  startRound,
  settle,
  resumeRound,
} from "../src/engine/game";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import {
  isRecruitable,
  availableUnits,
  type Series,
} from "../src/engine/rotation";
import { UNIT, RULES } from "../src/data/units";
import { ITEM } from "../src/data/items";
import { DEATH_SONG, skillDescription } from "../src/data/skills";
import { LINGJIU_DEMO } from "../src/data/lingjiu-demo";
import { compute } from "../src/compute/job";
import { BattleSoundTrack } from "../src/audio/cues";
import {
  CURRENT_COMBAT_VERSION,
  type Game,
  type Piece,
} from "../src/engine/types";
import frozen from "./fixtures/pre-v040-replays.json";

const p = (
  defId: string,
  uid: number,
  star = 1,
  position: number | null = 35,
): Piece => ({ defId, uid, star, position });
const f = (defId: string, uid: number, side: 0 | 1, star = 1) =>
  Object.assign(army([p(defId, uid, star)], side)[0], {
    x: 3,
    y: side ? 2 : 3,
    mana: 100,
    shield: 0,
    magicResist: 0,
  });
function setup(star = 1) {
  const source = f("lingjiu", 101, 0, star),
    target = f("guard", 201, 1, 3);
  target.hp = target.maxHp = 10000;
  const ctx: CombatContext = {
    fighters: [source, target],
    tick: 10,
    events: [],
    effects: [],
  };
  return { source, target, ctx };
}
function clearShops(g: Game) {
  for (const q of g.players) {
    for (const id of q.shop) if (id) g.pool[id]++;
    q.shop = [null, null, null, null, null];
  }
}
const envelope = (game: Game) =>
  JSON.stringify({
    schema: 38,
    rules: "singleplayer-0.39",
    savedAt: 1,
    revision: 1,
    game,
    playback: { time: 3, speed: 2, paused: true },
  });

describe("灵鹫死魂曲", () => {
  it.each([1, 2, 3])(
    "%i星飞行刺杀使用固定法伤成长，不复制普通攻击或额外控制",
    (star) => {
      expect(UNIT.lingjiu).toMatchObject({
        cost: 2,
        traits: ["海神", "刺杀"],
        hp: 550,
        attack: 101,
        armor: 0,
        range: 3,
        interval: 8,
        initialMana: 25,
        flying: true,
      });
      const fresh = army([p("lingjiu", 1, star)], 0)[0];
      expect(fresh.maxHp).toBe(550 * 2 ** (star - 1));
      expect(fresh.attack).toBe(101 * 2 ** (star - 1));
      expect(fresh.mana).toBe(25);
      expect(fresh.air?.flying).toBe(true);
      expect(usesEnergy(fresh)).toBe(true);
      expect(skillGauge(fresh).progress).toBe(0.25);
      const { source, target, ctx } = setup(star);
      source.attack = 9999;
      source.skillPower = 1.5;
      target.magicResist = 0.25;
      target.armor = 999;
      target.air!.evasion = 1;
      target.air!.flying = true;
      expect(castSkill(ctx, source, target)).toBe(true);
      expect(ctx.events).toHaveLength(1);
      expect(ctx.events[0]).toMatchObject({
        amount: Math.round(DEATH_SONG.damage[star - 1] * 1.5 * 0.75),
        damageType: "magic",
        skill: true,
        ranged: true,
        primary: true,
      });
      expect(source).toMatchObject({ mana: 0, skillReadyAt: 34 });
      expect(source.signature?.casts).toBe(1);
      expect(target.stunUntil).toBe(0);
      expect(target.silenceUntil).toBeUndefined();
      expect(target.armorBreak).toBe(0);
      expect(target.burn).toBeUndefined();
      expect(ctx.effects.filter((e) => e.kind === "pulse")).toMatchObject([
        { name: "死魂曲", from: { x: 3, y: 3 }, to: { x: 3, y: 3 } },
      ]);
      expect(skillDescription("lingjiu")).toContain("200/300/400");
    },
  );

  it("圆形几何包含斜邻格，排除两格直线，边缘截断且与命中范围一致", () => {
    expect(deathSongCells({ x: 3, y: 3 })).toHaveLength(9);
    expect(deathSongCells({ x: 0, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
    expect(inDeathSong({ x: 3, y: 3 }, { x: 4, y: 4 })).toBe(true);
    expect(inDeathSong({ x: 3, y: 3 }, { x: 5, y: 3 })).toBe(false);
    const { source, target, ctx } = setup();
    const ally = Object.assign(f("guard", 301, 0), { x: 2, y: 3 });
    const others = deathSongCells(source)
      .filter(
        (cell) =>
          !(cell.x === 3 && cell.y === 3) &&
          !(cell.x === 3 && cell.y === 2) &&
          !(cell.x === 2 && cell.y === 3),
      )
      .map((cell, index) =>
        Object.assign(
          f(index % 2 ? "ghostjet" : "guard", 400 + index, 1, 3),
          cell,
          { hp: 10000, maxHp: 10000 },
        ),
      );
    for (const enemy of others) enemy.air!.phaseUntil = 100;
    const outside = Object.assign(f("guard", 501, 1), { x: 5, y: 3 });
    ctx.fighters.push(ally, ...others, outside);
    const beforeAlly = ally.hp,
      beforeSource = source.hp;
    expect(castSkill(ctx, source, target)).toBe(true);
    expect(ctx.events.filter((e) => e.attacker === 101)).toHaveLength(7);
    expect(ctx.events.filter((e) => e.primary)).toHaveLength(1);
    expect(ally.hp).toBe(beforeAlly);
    expect(source.hp).toBe(beforeSource);
    expect(outside.hp).toBe(outside.maxHp);
  });

  it("普通选敌的曼哈顿同距顺序不阻止圆内斜邻敌人触发技能", () => {
    const { source, target, ctx } = setup();
    target.y = 1;
    const diagonal = Object.assign(f("guard", 301, 1), { x: 4, y: 2 });
    ctx.fighters.push(diagonal);
    const hp = target.hp;
    expect(castSkill(ctx, source, target)).toBe(true);
    expect(target.hp).toBe(hp);
    expect(ctx.events.filter((e) => e.attacker === 101)).toMatchObject([
      { target: 301, primary: true },
    ]);
  });

  it("海神回能每个战斗步只触发一次，不随范围命中人数重复赠能", () => {
    const { source, target, ctx } = setup();
    source.air!.seaMana = 10;
    ctx.fighters.push(Object.assign(f("guard", 301, 1), { x: 4, y: 3 }));
    expect(castSkill(ctx, source, target)).toBe(true);
    expect(ctx.events.filter((e) => e.attacker === 101)).toHaveLength(2);
    expect(source.mana).toBe(10);
    expect(source.air!.seaTick).toBe(10);
  });

  it.each([
    "dead",
    "stun",
    "silence",
    "charm",
    "mana",
    "cooldown",
    "far",
    "ally",
    "concealed",
    "deadTarget",
    "summon",
  ])("%s阻止启动，保留能量且不产生伪音波", (reason) => {
    const { source, target, ctx } = setup();
    if (reason === "dead") source.hp = 0;
    if (reason === "stun") source.stunUntil = 11;
    if (reason === "silence") source.silenceUntil = 11;
    if (reason === "charm")
      source.charm = { until: 11, attack: source.attack, side: 0 };
    if (reason === "mana") source.mana = 99;
    if (reason === "cooldown") source.skillReadyAt = 11;
    if (reason === "far") target.y = 1;
    if (reason === "ally") target.side = 0;
    if (reason === "concealed") target.air!.phaseUntil = 11;
    if (reason === "deadTarget") target.hp = 0;
    if (reason === "summon") source.summon = { owner: 1, born: 0 };
    const before = structuredClone(ctx);
    expect(castSkill(ctx, source, target)).toBe(false);
    expect(ctx).toEqual(before);
  });

  it("六秒冷却期间正常回能，到期后才能再次施放", () => {
    const { source, target, ctx } = setup();
    castSkill(ctx, source, target);
    gainMana(source, 100, 11);
    expect(source.mana).toBe(100);
    ctx.tick = 33;
    expect(castSkill(ctx, source, target)).toBe(false);
    ctx.tick = 34;
    expect(castSkill(ctx, source, target)).toBe(true);
    expect(source.signature?.casts).toBe(2);
  });

  it("护盾单独吸收，技能免伤与残魂走统一伤害流程，不触发普攻吸血", () => {
    const { source, target, ctx } = setup();
    source.hp = source.maxHp / 2;
    source.lifesteal = 1;
    target.shield = 1000;
    const before = source.hp;
    castSkill(ctx, source, target);
    expect(ctx.events[0]).toMatchObject({ amount: 0, absorbed: 200 });
    expect(target.hp).toBe(target.maxHp);
    expect(source.hp).toBe(before);
    for (const immune of ["spin", "soul"]) {
      const fixture = setup();
      if (immune === "spin") startBladeStorm(fixture.ctx, fixture.target);
      else fixture.target.immortal = { spent: true, until: 100, duration: 16 };
      const hp = fixture.target.hp;
      castSkill(fixture.ctx, fixture.source, fixture.target);
      expect(fixture.target.hp).toBe(hp);
      expect(fixture.ctx.events[0].immune).toBe(true);
    }
  });

  it("反伤导致施法者阵亡时停止剩余命中，不产生死后范围伤害", () => {
    const { source, target, ctx } = setup();
    source.hp = 1;
    target.reflection = 1000;
    const other = Object.assign(f("guard", 301, 1), { x: 4, y: 3 });
    ctx.fighters.push(other);
    const hp = other.hp;
    expect(castSkill(ctx, source, target)).toBe(true);
    expect(source.hp).toBe(0);
    expect(other.hp).toBe(hp);
    expect(ctx.events.filter((e) => e.attacker === 101)).toHaveLength(1);
  });

  it("旧版本单刺不跳跃时仍可三格普攻，满能量不会远程空放自身音波", () => {
    const battle = simulate(
      [{ ...p("lingjiu", 101), items: ["staff", "staff", "heart"] }],
      [p("specialist", 201, 3, 51)],
      "wildfront",
    );
    const firstAttackFrame = battle.frames.find((fr) =>
      fr.events.some((e) => e.attacker === 101 && !e.skill),
    )!;
    const attack = firstAttackFrame.events.find(
      (e) => e.attacker === 101 && !e.skill,
    )!;
    expect(
      Math.abs(attack.from.x - attack.to.x) +
        Math.abs(attack.from.y - attack.to.y),
    ).toBe(3);
    expect(
      firstAttackFrame.effects.some(
        (e) => e.source === 101 && e.kind === "cast",
      ),
    ).toBe(false);
    expect(firstAttackFrame.fighters.find((f) => f.uid === 101)?.mana).toBe(
      100,
    );
  });
});

describe("灵鹫经营、阵容与兼容", () => {
  it("飞行可接受空军和海神效果，但本身没有伪空军或猛禽种族", () => {
    const units = army(
      [
        p("lingjiu", 101),
        p("repair", 102, 1, 36),
        p("bomber", 103, 1, 37),
        p("fish", 104, 1, 43),
      ],
      0,
    );
    const unit = units.find((f) => f.uid === 101)!;
    expect(unit.air?.flying).toBe(true);
    expect(unit.air!.evasion).toBeGreaterThan(0);
    expect(unit.air!.seaMana).toBe(0);
    expect(unit.air!.seaWard).toBe(0.2);
    expect(unit.magicResist).toBeCloseTo(0.4);
    expect(UNIT.lingjiu.traits).toEqual(["海神", "刺杀"]);
  });

  it.each(["assassins", "fleet"] as const)(
    "%s AI使用正常购买接口采用灵鹫，回能和技能强度均有实际价值",
    (profile) => {
      const g = createGame(137, "classic");
      clearShops(g);
      const bot = g.players[1];
      bot.aiProfile = profile;
      bot.gold = 2;
      bot.shop[0] = "lingjiu";
      g.pool.lingjiu--;
      prepareBot(g, bot, { buy, sell, roll, buyXp });
      expect(
        bot.pieces.some((p) => p.defId === "lingjiu" && p.position !== null),
      ).toBe(true);
      expect(bot.gold).toBe(0);
      expect(validGame(g)).toBe(true);
      const plain = p("lingjiu", 1);
      expect(abilityCredit({ ...plain, items: ["staff"] })).toBeGreaterThan(
        abilityCredit(plain),
      );
      expect(itemScore(plain, "staff")).toBeGreaterThan(0);
    },
  );

  it("两刺杀跳后排、正常装备演示、完整/轻量/Worker和战报一致且不改永久棋子", () => {
    const before = structuredClone(LINGJIU_DEMO);
    expect(
      [...before.left, ...before.right].every(
        (piece) =>
          piece.star <= 3 &&
          (piece.items?.length ?? 0) <= 3 &&
          (piece.items ?? []).every((id) => ITEM[id]),
      ),
    ).toBe(true);
    const initial = army(before.left, 0).find((f) => f.uid === 101)!;
    const battle = simulate(before.left, before.right);
    const jumped = battle.frames[0].fighters.find((f) => f.uid === 101)!;
    expect({ x: jumped.x, y: jumped.y }).not.toEqual({
      x: initial.x,
      y: initial.y,
    });
    const waves = battle.frames.flatMap((fr) =>
      fr.effects.filter(
        (e) => e.source === 101 && e.kind === "pulse" && e.name === "死魂曲",
      ),
    );
    expect(waves.length).toBeGreaterThan(0);
    const row = analyzeBattle(battle).sides[0].fighters.find(
      (f) => f.uid === 101,
    )!;
    expect(row.casts).toBe(waves.length);
    expect(row.skillDamage).toBeGreaterThan(0);
    expect(row.skillDamage).toBe(
      battle.frames
        .flatMap((fr) => fr.events)
        .filter((e) => e.attacker === 101 && e.skill && !e.reflected)
        .reduce((sum, e) => sum + e.amount, 0),
    );
    for (const frame of battle.frames) {
      const alive = frame.fighters.filter((f) => f.hp > 0);
      expect(new Set(alive.map((f) => `${f.x},${f.y}`)).size).toBe(
        alive.length,
      );
    }
    const quick = simulateOutcome(before.left, before.right);
    expect(quick.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
    expect(quick.winner).toBe(battle.winner);
    expect(quick.damage).toBe(battle.damage);
    expect(
      compute({ kind: "replay", ...before, version: CURRENT_COMBAT_VERSION }),
    ).toEqual({
      kind: "replay",
      battle,
    });
    const track = new BattleSoundTrack();
    track.reset(battle, 0);
    expect(
      track
        .take(
          battle,
          battle.frames.findIndex((fr) =>
            fr.effects.some(
              (e) =>
                e.source === 101 && e.kind === "pulse" && e.name === "死魂曲",
            ),
          ),
          true,
        )
        .some((cue) => cue.kind === "chime"),
    ).toBe(true);
    expect(LINGJIU_DEMO).toEqual(before);
  });

  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`${banned}/${phase}迁移只补合法卡池，资源、风格、历史和播放原样保留`, () => {
        const g = createGame(137, "classic");
        clearShops(g);
        g.pool.lingjiu = 0; // Old-roster fixture: bots cannot buy the not-yet-existing two-cost unit.
        g.bannedSeries = (
          banned ? ["海神", "装甲", "熊猫"] : ["猛禽", "装甲", "熊猫"]
        ) as Series[];
        for (const id of Object.keys(g.pool))
          if (!isRecruitable(g, id)) g.pool[id] = 0;
        const me = g.players[0];
        me.shop[0] = phase === "finished" ? "medic" : "guard";
        g.pool[me.shop[0]]--;
        buy(g, me, 0);
        move(g, me, me.pieces[0].uid, 35);
        if (phase === "finished") me.hp = 1;
        const result = phase === "prepare" ? null : startRound(g);
        if (phase === "result" || phase === "finished") settle(g, result!);
        expect(g.phase).toBe(phase);
        delete g.pool.lingjiu;
        const before = structuredClone(g),
          decoded = decodeSave(envelope(g));
        expect(decoded.status).toBe("migrated");
        expect(decoded.data!.game).toEqual({
          ...before,
          pool: { ...before.pool, lingjiu: banned ? 0 : 30 },
        });
        expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
        expect(decoded.data!.rules).toBe(RULES.version);
        expect(decoded.data!.playback).toEqual({
          time: 3,
          speed: 2,
          paused: true,
        });
        expect(validGame(decoded.data!.game)).toBe(true);
        expect(
          availableUnits(decoded.data!.game).some((u) => u.id === "lingjiu"),
        ).toBe(!banned);
        if (phase === "battle")
          expect(resumeRound(decoded.data!.game)!.battle).toEqual(
            result!.battle,
          );
      });

  for (const entry of frozen.fixtures)
    it(`0.39旧回放${entry.name}逐帧不变`, async () => {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(simulate(entry.left, entry.right, "puppets")),
        ),
      );
      expect(
        Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(entry.hash);
    });
});
