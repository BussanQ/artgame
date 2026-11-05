import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  damage,
  gainMana,
  type CombatContext,
} from "../src/engine/abilities";
import {
  acidCells,
  applyCorrosion,
  corrosionArmor,
} from "../src/engine/beasts";
import { effectiveArmor, usesEnergy } from "../src/engine/triggers";
import { startBladeStorm } from "../src/engine/swordthrall";
import { enterPhoenixEgg } from "../src/engine/phoenix";
import { enterUndying } from "../src/engine/immortality";
import { abilityCredit, prepareBot } from "../src/engine/ai";
import { itemScore } from "../src/engine/equipment";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { battleAnalysisMarkup } from "../src/ui/battle-analysis";
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
  availableUnits,
  isRecruitable,
  type Series,
} from "../src/engine/rotation";
import { UNIT, RULES } from "../src/data/units";
import { equipmentStats, ITEM } from "../src/data/items";
import {
  ACID_POLLUTION,
  TUSK_CHARGE,
  skillDescription,
} from "../src/data/skills";
import { BEAST_FRONTLINE_DEMO } from "../src/data/beast-frontline-demo";
import { compute } from "../src/compute/job";
import { knockupLift } from "../src/render/beast-presentation";
import {
  CURRENT_COMBAT_VERSION,
  type Game,
  type Piece,
} from "../src/engine/types";
import frozen from "./fixtures/pre-v039-replays.json";

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
function setup(defId = "elephant", star = 1) {
  const source = f(defId, 101, 0, star),
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
const envelope = (game: Game) =>
  JSON.stringify({
    schema: 37,
    rules: "singleplayer-0.38",
    savedAt: 1,
    revision: 1,
    game,
    playback: { time: 3, speed: 2, paused: true },
  });
function clearShops(g: Game) {
  for (const q of g.players) {
    for (const id of q.shop) if (id) g.pool[id]++;
    q.shop = [null, null, null, null, null];
  }
}

describe("野兽前排技能", () => {
  it.each([1, 2, 3])(
    "%i星巨齿象使用固定法伤，原地击飞不改变棋格或飞行种族",
    (star) => {
      expect(UNIT.elephant).toMatchObject({
        cost: 1,
        traits: ["野兽", "先锋"],
        hp: 650,
        attack: 46,
        interval: 5,
        armor: 5,
      });
      const fresh = army([p("elephant", 101, star)], 0)[0];
      expect(fresh.maxHp).toBe(650 * 2 ** (star - 1));
      expect(fresh.attack).toBe(46 * 2 ** (star - 1));
      expect(fresh.mana).toBe(25);
      expect(usesEnergy(fresh)).toBe(true);
      const { source, target, ctx } = setup("elephant", star);
      source.skillPower = 1.5;
      source.attack = 9999;
      target.magicResist = 0.25;
      target.armor = 999;
      const position = { x: target.x, y: target.y, flying: target.air!.flying };
      target.air!.cast = {
        kind: "medic",
        next: 12,
        remaining: 4,
        damage: 0,
        from: { x: 3, y: 2 },
        to: { x: 3, y: 2 },
      };
      expect(castSkill(ctx, source, target)).toBe(true);
      expect(ctx.events[0]).toMatchObject({
        amount: Math.round(TUSK_CHARGE.damage[star - 1] * 1.5 * 0.75),
        skill: true,
        damageType: "magic",
      });
      expect(source).toMatchObject({ mana: 0, skillReadyAt: 90 });
      expect(target).toMatchObject({
        x: position.x,
        y: position.y,
        stunUntil: 15,
        knockup: { start: 10, until: 14 },
      });
      expect(target.air!.flying).toBe(position.flying);
      expect(target.air!.cast).toBeUndefined();
      expect(ctx.effects.filter((e) => e.name === "击飞")).toHaveLength(1);
      expect(knockupLift(target, 10)).toBe(0);
      expect(knockupLift(target, 12)).toBe(48);
      expect(knockupLift(target, 14)).toBe(0);
      expect(knockupLift(target, 12, true)).toBe(0);
    },
  );

  for (const id of ["elephant", "venombeast"])
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
    ])(`${id}/%s阻止启动且没有扣能量或产生效果`, (reason) => {
      const { source, target, ctx } = setup(id);
      if (reason === "dead") source.hp = 0;
      if (reason === "stun") source.stunUntil = 11;
      if (reason === "silence") source.silenceUntil = 11;
      if (reason === "charm")
        source.charm = { until: 11, attack: source.attack, side: 0 };
      if (reason === "mana") source.mana = 99;
      if (reason === "cooldown") source.skillReadyAt = 11;
      if (reason === "far") Object.assign(target, { x: 7, y: 0 });
      if (reason === "ally") target.side = 0;
      if (reason === "concealed") target.air!.phaseUntil = 11;
      if (reason === "deadTarget") target.hp = 0;
      if (reason === "summon") source.summon = { owner: 9, born: 0 };
      const before = structuredClone(ctx);
      expect(castSkill(ctx, source, target)).toBe(false);
      expect(ctx).toEqual(before);
    });

  it.each([1, 2, 3])(
    "%i星猛毒兽减甲和冷却独立成长，满能量远程喷吐不增加普攻射程",
    (star) => {
      expect(UNIT.venombeast).toMatchObject({
        cost: 2,
        hp: 650,
        attack: 106,
        armor: 5,
        range: 1,
        interval: 6,
      });
      const { source, target, ctx } = setup("venombeast", star);
      Object.assign(target, { x: 3, y: 0 });
      source.skillPower = 10;
      source.attack = 9999;
      expect(castSkill(ctx, source, target)).toBe(true);
      expect(source.range).toBe(1);
      expect(source.skillReadyAt).toBe(10 + ACID_POLLUTION.cooldown[star - 1]);
      expect(source.mana).toBe(0);
      expect(corrosionArmor(target, 10)).toBe(ACID_POLLUTION.armor[star - 1]);
      expect(corrosionArmor(target, 33)).toBe(ACID_POLLUTION.armor[star - 1]);
      expect(corrosionArmor(target, 34)).toBe(0);
      expect(target.hp).toBe(target.maxHp);
      expect(ctx.events).toEqual([]);
      source.hp = 0;
      expect(corrosionArmor(target, 20)).toBe(ACID_POLLUTION.armor[star - 1]);
    },
  );

  it("九宫格边界截断，酸液覆盖空中和隐蔽敌人，排除友军与区域外单位", () => {
    expect(acidCells({ x: 0, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
    const { source, target, ctx } = setup("venombeast", 2);
    const victims = acidCells(target).map((point, i) =>
      Object.assign(f(i % 2 ? "ghostjet" : "guard", 300 + i, 1), point),
    );
    for (const v of victims) v.air!.phaseUntil = 100;
    const ally = Object.assign(f("guard", 400, 0), { x: 2, y: 2 });
    const outside = Object.assign(f("guard", 401, 1), { x: 5, y: 2 });
    ctx.fighters.push(...victims, ally, outside);
    expect(castSkill(ctx, source, target)).toBe(true);
    expect(victims.every((v) => corrosionArmor(v, 10) === 14)).toBe(true);
    expect(corrosionArmor(ally, 10)).toBe(0);
    expect(corrosionArmor(outside, 10)).toBe(0);
    const late = Object.assign(f("guard", 402, 1), { x: 2, y: 2 });
    ctx.fighters.push(late);
    expect(corrosionArmor(late, 11)).toBe(0);
  });

  it("污染取最强值且独立计时；弱酸不能延长强酸，与步兵减甲和普通破甲叠加", () => {
    const { source, target, ctx } = setup("venombeast");
    target.armor = 40;
    target.infantryArmorBreak = 3;
    target.armorBreak = 4;
    target.armorBreakUntil = 100;
    applyCorrosion(target, 1, 21, 20);
    applyCorrosion(target, 2, 7, 50);
    applyCorrosion(target, 2, 7, 60);
    expect(target.corrosion).toHaveLength(2);
    expect(effectiveArmor(target, 19)).toBe(16);
    ctx.tick = 19;
    damage(ctx, source, target, 100);
    expect(ctx.events.at(-1)!.amount).toBe(Math.round(100 / (1 + 12 * 0.06)));
    expect(effectiveArmor(target, 20)).toBe(30);
    ctx.tick = 20;
    damage(ctx, source, target, 100, "magic");
    expect(ctx.events.at(-1)!.amount).toBe(100);
    target.armor = 0;
    damage(ctx, source, target, 100);
    expect(ctx.events.at(-1)!.amount).toBe(100);
    expect(corrosionArmor(target, 60)).toBe(0);
  });

  it("技能免控、残魂、火种不追加酸蚀或击飞；化蛋与残魂清除已有污染", () => {
    for (const kind of ["spin", "soul", "egg"]) {
      for (const id of ["elephant", "venombeast"]) {
        const { source, target, ctx } = setup(id);
        if (kind === "spin") startBladeStorm(ctx, target);
        if (kind === "soul")
          target.immortal = { spent: true, until: 100, duration: 16 };
        if (kind === "egg")
          target.phoenix = {
            spent: true,
            eggUntil: 100,
            bodyMaxHp: 10000,
            hatched: false,
          };
        expect(castSkill(ctx, source, target)).toBe(true);
        expect(target.corrosion).toBeUndefined();
        expect(target.knockup).toBeUndefined();
      }
    }
    const { target, ctx } = setup();
    applyCorrosion(target, 1, 14, 100);
    target.knockup = { start: 9, until: 13 };
    target.star = 2;
    target.phoenix = {
      spent: false,
      eggUntil: 0,
      bodyMaxHp: 10000,
      hatched: false,
    };
    target.hp = 0;
    expect(enterPhoenixEgg(ctx, target)).toBe(true);
    expect(target.corrosion).toBeUndefined();
    expect(target.knockup).toBeUndefined();
    delete target.phoenix;
    applyCorrosion(target, 1, 14, 100);
    target.immortal = { spent: false, until: 0, duration: 16 };
    target.hp = 0;
    expect(enterUndying(ctx, target)).toBe(true);
    expect(target.corrosion).toBeUndefined();
  });

  it("灵鱼驱散酸蚀和击飞，同时保留开场步兵减甲", () => {
    const { source, target, ctx } = setup("venombeast", 2);
    castSkill(ctx, source, target);
    target.infantryArmorBreak = 3;
    target.knockup = { start: 9, until: 13 };
    target.stunUntil = 14;
    const fish = Object.assign(f("fish", 301, 1), { x: 4, y: 2 });
    ctx.fighters.push(fish);
    expect(castSkill(ctx, fish, source)).toBe(true);
    expect(target.corrosion).toBeUndefined();
    expect(target.knockup).toBeUndefined();
    expect(target.stunUntil).toBe(0);
    expect(target.infantryArmorBreak).toBe(3);
  });

  it("冷却期间可回能，技能到期前不重复释放", () => {
    for (const id of ["elephant", "venombeast"]) {
      const { source, target, ctx } = setup(id);
      castSkill(ctx, source, target);
      gainMana(source, 100, 11);
      ctx.tick = source.skillReadyAt! - 1;
      expect(castSkill(ctx, source, target)).toBe(false);
      expect(source.mana).toBe(100);
      ctx.tick++;
      expect(castSkill(ctx, source, target)).toBe(true);
    }
  });

  it("正常战斗在三格处先喷酸液，普攻仍需继续接近", () => {
    const battle = simulate(
      [{ ...p("venombeast", 101), items: ["staff", "staff", "heart"] }],
      [p("specialist", 201, 2, 51)],
    );
    const castFrame = battle.frames.find((fr) =>
      fr.effects.some((e) => e.source === 101 && e.name === "酸性污染"),
    );
    expect(castFrame).toBeDefined();
    const cast = castFrame!.effects.find(
      (e) => e.source === 101 && e.name === "酸性污染",
    )!;
    expect(
      Math.abs(cast.from.x - cast.to.x) + Math.abs(cast.from.y - cast.to.y),
    ).toBe(3);
    expect(castFrame!.events.some((e) => e.attacker === 101 && !e.skill)).toBe(
      false,
    );
  });
});

describe("野兽前排经营、回放和统计", () => {
  it("AI按真实付费接口采用低费野兽，辅助价值不会获得技能强度加分", () => {
    const g = createGame(137, "classic");
    clearShops(g);
    const bot = g.players[1];
    bot.aiProfile = "beasts";
    bot.gold = 3;
    bot.shop[0] = "elephant";
    g.pool.elephant--;
    bot.shop[1] = "venombeast";
    g.pool.venombeast--;
    prepareBot(g, bot, { buy, sell, roll, buyXp });
    expect(
      bot.pieces.filter(
        (p) =>
          ["elephant", "venombeast"].includes(p.defId) && p.position !== null,
      ),
    ).toHaveLength(2);
    expect(bot.gold).toBe(0);
    expect(validGame(g)).toBe(true);
    const venom = p("venombeast", 1);
    const gear = equipmentStats([]);
    expect(abilityCredit(venom, { ...gear, skillPower: 9 })).toBe(
      abilityCredit(venom, gear),
    );
    expect(itemScore(venom, "staff")).toBe(80); // 40 starting mana, no fictitious skill-power credit.
    expect(itemScore(p("elephant", 2), "staff")).toBeGreaterThan(0);
    expect(skillDescription("venombeast")).toContain("10/8/6");
  });

  it("六对六演示产生真实击飞和酸蚀，统计不泄露未来，完整/快速/Worker相同且不改永久阵容", () => {
    const before = structuredClone(BEAST_FRONTLINE_DEMO);
    expect(
      [...before.left, ...before.right].every(
        (piece) =>
          piece.star <= 3 &&
          (piece.items?.length ?? 0) <= 3 &&
          (piece.items ?? []).every((id) => ITEM[id]),
      ),
    ).toBe(true);
    const battle = simulate(before.left, before.right);
    const effects = battle.frames.flatMap((fr) => fr.effects);
    expect(effects.some((e) => e.source === 101 && e.name === "击飞")).toBe(
      true,
    );
    expect(effects.some((e) => e.source === 102 && e.name === "酸性减甲")).toBe(
      true,
    );
    const atStart = analyzeBattle(battle, 0).sides[0].fighters;
    expect(atStart.find((row) => row.uid === 102)?.armorApplications).toBe(0);
    const analysis = analyzeBattle(battle),
      rows = analysis.sides[0].fighters;
    const venom = rows.find((row) => row.uid === 102)!;
    expect(venom.skillDamage).toBe(0);
    expect(venom.armorApplications).toBe(
      effects.filter((e) => e.source === 102 && e.name === "酸性减甲").length,
    );
    expect(rows.find((row) => row.uid === 101)?.knockups).toBeGreaterThan(0);
    const markup = battleAnalysisMarkup(
      analysis,
      "damage",
      "野兽破阵",
      battle.frames.length - 1,
      battle.frames.at(-1)!.tick,
    );
    expect(markup).toContain("酸蚀命中");
    expect(markup).toContain("击飞");
    for (const frame of battle.frames) {
      const alive = frame.fighters.filter((f) => f.hp > 0);
      expect(new Set(alive.map((f) => `${f.x},${f.y}`)).size).toBe(
        alive.length,
      );
    }
    const quick = simulateOutcome(before.left, before.right);
    expect(quick.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
    expect(quick.final.tick).toBe(battle.frames.at(-1)!.tick);
    expect(quick.winner).toBe(battle.winner);
    expect(quick.damage).toBe(battle.damage);
    expect(
      compute({ kind: "replay", ...before, version: CURRENT_COMBAT_VERSION }),
    ).toEqual({
      kind: "replay",
      battle,
    });
    expect(BEAST_FRONTLINE_DEMO).toEqual(before);
  });

  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`${banned}/${phase}迁移仅补合法卡池，保存资源、随机数、风格和旧回放`, () => {
        const g = createGame(137, "classic");
        clearShops(g);
        // Model the old roster before bot preparation; a real 0.38 save cannot own these units.
        g.pool.elephant = 0;
        g.pool.venombeast = 0;
        g.bannedSeries = (
          banned ? ["野兽", "猛禽", "陆行者"] : ["装甲", "猛禽", "陆行者"]
        ) as Series[];
        for (const id of Object.keys(g.pool))
          if (!isRecruitable(g, id)) g.pool[id] = 0;
        const me = g.players[0];
        me.shop[0] = phase === "finished" ? "fish" : "guard";
        g.pool[me.shop[0]]--;
        buy(g, me, 0);
        move(g, me, me.pieces[0].uid, 35);
        if (phase === "finished") me.hp = 1;
        if (phase !== "prepare") g.combatVersion = "puppets";
        const result = phase === "prepare" ? null : startRound(g);
        if (phase === "result" || phase === "finished") settle(g, result!);
        expect(g.phase).toBe(phase);
        delete g.pool.elephant;
        delete g.pool.venombeast;
        const before = structuredClone(g),
          decoded = decodeSave(envelope(g));
        expect(decoded.status).toBe("migrated");
        expect(decoded.data!.game).toEqual({
          ...before,
          pool: {
            ...before.pool,
            elephant: banned ? 0 : 45,
            venombeast: banned ? 0 : 30,
          },
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
          availableUnits(decoded.data!.game).some((u) => u.id === "elephant"),
        ).toBe(!banned);
        if (phase === "battle")
          expect(resumeRound(decoded.data!.game)!.battle).toEqual(
            result!.battle,
          );
      });

  for (const entry of frozen.fixtures)
    it(`0.38旧回放${entry.name}逐帧不变`, async () => {
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(simulate(entry.left, entry.right, "puppets")),
        ),
      );
      expect(
        Array.from(new Uint8Array(hash), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(entry.hash);
    });
});
