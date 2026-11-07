import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  combatAttack,
  damage,
  type CombatContext,
} from "../src/engine/abilities";
import { commandBonuses } from "../src/engine/ironrooster";
import { effectiveArmor } from "../src/engine/triggers";
import { callWolfPack } from "../src/engine/summons";
import { enterPhoenixEgg } from "../src/engine/phoenix";
import { enterUndying } from "../src/engine/immortality";
import {
  CURRENT_COMBAT_VERSION,
  type Fighter,
  type Piece,
} from "../src/engine/types";
import { COPIES, RULES, UNIT } from "../src/data/units";
import {
  createGame,
  buy,
  startRound,
  resumeRound,
  settle,
  sell,
} from "../src/engine/game";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { itemScore } from "../src/engine/equipment";
import {
  abilityCredit,
  pieceStrength,
  prepareBot,
} from "../src/engine/ai";
import { roll, buyXp } from "../src/engine/game";
import { pieceDetails } from "../src/ui/bench-tooltip";
import { codexCards } from "../src/ui/unit-codex";
import { compute } from "../src/compute/job";
import { rangedPose, RANGED_ACTIONS } from "../src/render/ranged";
import frozen from "./fixtures/pre-v030-replays.json";
const p = (
  defId: string,
  uid: number,
  star = 1,
  position: number | null = 35,
): Piece => ({ defId, uid, star, position });
const f = (id: string, uid: number, side: 0 | 1 = 0, star = 1) => {
  const fighter = army([p(id, uid, star)], side)[0];
  Object.assign(fighter, { x: 3, y: 3, mana: 100 });
  return fighter;
};
const context = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 10,
  events: [],
  effects: [],
});
const setup = (star = 1) => {
  const rooster = f("ironrooster", 1, 0, star),
    friend = f("infantry", 2),
    enemy = f("turtle", 101, 1);
  enemy.y = 2;
  friend.y = 4;
  return { rooster, friend, enemy, ctx: context(rooster, friend, enemy) };
};

describe("铁鸡战术协同", () => {
  it.each([1, 2, 3])("%i星增攻加甲，不直接伤害或治疗，六秒后结束", (star) => {
    const { rooster, friend, enemy, ctx } = setup(star);
    const hp = friend.hp,
      attack = friend.attack,
      armor = friend.armor;
    rooster.skillPower = 4;
    expect(castSkill(ctx, rooster, enemy)).toBe(true);
    expect(rooster.mana).toBe(0);
    expect(rooster.skillReadyAt).toBe(62);
    for (const ally of [rooster, friend])
      expect(commandBonuses(ally, 10)).toEqual({
        attack: (5 + star * 10) / 100,
        armor: 1 + star * 2,
      });
    expect(combatAttack(friend, 10)).toBeCloseTo(
      attack * (1 + (5 + star * 10) / 100),
    );
    expect(effectiveArmor(friend, 10)).toBe(armor + 1 + star * 2);
    expect(commandBonuses(friend, 34)).toEqual({ attack: 0, armor: 0 });
    expect(combatAttack(friend, 34)).toBe(attack);
    expect(effectiveArmor(friend, 34)).toBe(armor);
    expect(friend.hp).toBe(hp);
    expect(rooster.healing).toBe(0);
    expect(ctx.events).toHaveLength(0);
    expect(
      ctx.effects.filter((e) => e.kind === "fortify").map((e) => e.target),
    ).toEqual([1, 2]);
    rooster.mana = 100;
    ctx.tick = 61;
    expect(castSkill(ctx, rooster, enemy)).toBe(false);
    expect(rooster.mana).toBe(100);
    ctx.tick = 62;
    expect(castSkill(ctx, rooster, enemy)).toBe(true);
    expect(rooster.mana).toBe(0);
    expect(friend.command).toHaveLength(1);
    expect(friend.command![0].until).toBe(86);
  });
  it("范围三格、同阵营和存活限制；当前召唤物可受益，火种残魂及魅惑者不可", () => {
    const { rooster, friend, enemy, ctx } = setup();
    friend.y = 6;
    const out = f("guard", 3),
      dead = f("guard", 4),
      soul = f("vine", 5),
      egg = f("phoenix", 6, 0, 2),
      charmed = f("panda", 7),
      summon = f("panda", 8);
    out.y = 7;
    dead.hp = 0;
    soul.immortal = { spent: true, until: 100, duration: 16 };
    soul.hp = 1;
    egg.hp = 0;
    enterPhoenixEgg(ctx, egg);
    charmed.charm = { side: 1, until: 100, attack: 66 };
    summon.summon = { owner: 99, born: 1, kind: "puppet" };
    ctx.fighters.push(out, dead, soul, egg, charmed, summon);
    castSkill(ctx, rooster, enemy);
    expect(ctx.fighters.filter((f) => f.command).map((f) => f.uid)).toEqual([
      1, 2, 8,
    ]);
  });
  it("离开范围及施法者阵亡不撤销，后来的召唤物不继承", () => {
    const { rooster, friend, enemy, ctx } = setup();
    const wolf = f("wolf", 3);
    wolf.x = 4;
    ctx.fighters.push(wolf);
    castSkill(ctx, rooster, enemy);
    friend.y = 7;
    rooster.hp = 0;
    expect(commandBonuses(friend, 20).attack).toBe(0.15);
    expect(callWolfPack(ctx, wolf)).toBe(true);
    for (const summoned of ctx.fighters.filter((f) => f.summon))
      expect(summoned.command).toBeUndefined();
  });
  it("不同铁鸡各自计时，弱效果不延长强效果，同来源重施不堆叠", () => {
    const { rooster: strong, friend, enemy, ctx } = setup(3);
    const weak = f("ironrooster", 3);
    ctx.fighters.push(weak);
    castSkill(ctx, strong, enemy);
    ctx.tick = 20;
    castSkill(ctx, weak, enemy);
    expect(commandBonuses(friend, 33)).toEqual({ attack: 0.35, armor: 7 });
    expect(commandBonuses(friend, 34)).toEqual({ attack: 0.15, armor: 3 });
    expect(commandBonuses(friend, 44)).toEqual({ attack: 0, armor: 0 });
    weak.mana = 100;
    ctx.tick = 72;
    expect(castSkill(ctx, weak, enemy)).toBe(true);
    expect(friend.command).toHaveLength(1);
    expect(commandBonuses(friend, 73).attack).toBe(0.15);
  });
  it("与维修机强化和临时护甲分别取更高值，过期后退回仍有效的协同", () => {
    const { rooster, friend, enemy, ctx } = setup(2);
    castSkill(ctx, rooster, enemy);
    friend.attackBoost = { ratio: 0.45, until: 18 };
    friend.armorBuff = 8;
    friend.armorBuffUntil = 18;
    expect(combatAttack(friend, 17)).toBeCloseTo(friend.attack * 1.45);
    expect(effectiveArmor(friend, 17)).toBe(friend.armor + 8);
    expect(combatAttack(friend, 18)).toBeCloseTo(friend.attack * 1.25);
    expect(effectiveArmor(friend, 18)).toBe(friend.armor + 5);
  });
  it("魅惑换边暂停增益，回到原阵营且未到期时恢复；残魂和火种清除", () => {
    const { rooster, friend, enemy, ctx } = setup();
    castSkill(ctx, rooster, enemy);
    friend.side = 1;
    expect(commandBonuses(friend, 12)).toEqual({ attack: 0, armor: 0 });
    friend.side = 0;
    expect(commandBonuses(friend, 13).attack).toBe(0.15);
    friend.immortal = { duration: 16, spent: false, until: 0 };
    friend.hp = 0;
    expect(enterUndying(ctx, friend)).toBe(true);
    expect(friend.command).toBeUndefined();
    const phoenix = f("phoenix", 4, 0, 2);
    ctx.fighters.push(phoenix);
    rooster.mana = 100;
    ctx.tick = 62;
    castSkill(ctx, rooster, enemy);
    expect(phoenix.command).toBeDefined();
    phoenix.hp = 0;
    enterPhoenixEgg(ctx, phoenix);
    expect(phoenix.command).toBeUndefined();
  });
  it.each([
    "mana",
    "cooldown",
    "stun",
    "silence",
    "charm",
    "dead",
    "range",
    "hidden",
    "friendly",
    "targetDead",
  ] as const)("%s条件不满足时不扣能量或产生增益", (reason) => {
    const { rooster, friend, enemy, ctx } = setup();
    if (reason === "mana") rooster.mana = 99;
    if (reason === "cooldown") rooster.skillReadyAt = 11;
    if (reason === "stun") rooster.stunUntil = 11;
    if (reason === "silence") rooster.silenceUntil = 11;
    if (reason === "charm") rooster.charm = { side: 1, until: 20, attack: 100 };
    if (reason === "dead") rooster.hp = 0;
    if (reason === "range") enemy.y = 7;
    if (reason === "hidden") enemy.air!.phaseUntil = 20;
    if (reason === "friendly") enemy.side = 0;
    if (reason === "targetDead") enemy.hp = 0;
    const before = rooster.mana;
    expect(castSkill(ctx, rooster, enemy)).toBe(false);
    expect(rooster.mana).toBe(before);
    expect(friend.command).toBeUndefined();
    expect(ctx.effects).toHaveLength(0);
  });
  it("普攻实际伤害增大，物防降低受伤，真伤不受护甲影响", () => {
    const { rooster, friend, enemy, ctx } = setup(2);
    castSkill(ctx, rooster, enemy);
    const hit = (target: Fighter, kind: "physical" | "true") => {
      target.hp = target.maxHp;
      target.shield = 0;
      return damage(ctx, enemy, target, 100, kind, true);
    };
    const protectedHit = hit(friend, "physical");
    friend.command = undefined;
    expect(hit(friend, "physical")).toBeGreaterThan(protectedHit);
    expect(hit(friend, "true")).toBe(100);
    expect(
      damage(ctx, rooster, enemy, combatAttack(rooster, 10), "physical"),
    ).toBe(Math.round((250 * 100) / (100 + enemy.armor * 6)));
  });
});

describe("铁鸡集成", () => {
  it("属性、图鉴、动作及装备估值一致", () => {
    expect(UNIT.ironrooster).toMatchObject({
      cost: 4,
      hp: 750,
      attack: 100,
      armor: 5,
      range: 3,
      interval: 5,
      traits: ["装甲", "刺杀"],
    });
    expect(pieceDetails(p("ironrooster", 1)).name).toBe("铁鸡");
    expect(codexCards()).toContain("战术协同");
    expect(RANGED_ACTIONS.ironrooster.name).toBe("双足稳架交替炮击");
    expect(rangedPose("ironrooster", 0.4)).not.toEqual(
      rangedPose("motorcycle", 0.4),
    );
    expect(itemScore(p("ironrooster", 1), "staff")).toBe(80);
    expect(itemScore(p("ironrooster", 1), "crystal")).toBe(30);
    expect(abilityCredit(p("ironrooster", 1))).toBe(0);
    expect(pieceStrength(p("ironrooster", 1, 2))).toBeGreaterThan(
      pieceStrength(p("ironrooster", 1)),
    );
  });
  it("正常付费购买、升星、出售保持有限卡池，AI能购买部署", () => {
    const g = createGame(91, "classic"),
      me = g.players[0];
    me.gold = 20;
    for (let i = 0; i < 3; i++) {
      if (me.shop[i]) g.pool[me.shop[i]!]++;
      me.shop[i] = "ironrooster";
      g.pool.ironrooster--;
      expect(buy(g, me, i)).toBe(true);
    }
    expect(me.gold).toBe(8);
    expect(me.pieces[0].star).toBe(2);
    expect(g.pool.ironrooster).toBe(12);
    expect(validGame(g)).toBe(true);
    expect(sell(g, me, me.pieces[0].uid)).toBe(true);
    expect(g.pool.ironrooster).toBe(15);
    const bot = g.players[1];
    bot.aiProfile = "armor";
    bot.gold = 4;
    for (const id of bot.shop) if (id) g.pool[id]++;
    bot.shop = ["ironrooster", null, null, null, null];
    g.pool.ironrooster--;
    prepareBot(g, bot, { buy, sell, roll, buyXp });
    expect(bot.gold).toBe(0);
    expect(
      bot.pieces.some((p) => p.defId === "ironrooster" && p.position !== null),
    ).toBe(true);
    expect(validGame(g)).toBe(true);
  });
  it("开场刺杀跳跃后强化伙伴，完整/快速/Worker一致并保留输入", () => {
    const left = [
        p("ironrooster", 1, 2, 58),
        p("ghostjet", 2, 2, 59),
        p("irondog", 3, 2, 35),
        p("ironape", 4, 2, 36),
      ],
      right = [
        p("turtle", 101, 3, 35),
        p("medic", 102, 3, 51),
        p("birdrider", 103, 3, 58),
        p("guard", 104, 3, 36),
      ];
    const before = structuredClone([left, right]),
      b = simulate(left, right),
      fast = simulateOutcome(left, right);
    expect(b.frames[0].fighters.find((f) => f.uid === 1)!.y).toBeLessThan(4);
    expect(
      b.frames.some((fr) =>
        fr.effects.some((e) => e.source === 1 && e.kind === "fortify"),
      ),
    ).toBe(true);
    expect(
      b.frames
        .flatMap((fr) => fr.events)
        .some((e) => e.attacker === 1 && !e.skill),
    ).toBe(true);
    const casts = b.frames
      .filter((fr) =>
        fr.effects.some((e) => e.source === 1 && e.kind === "cast"),
      )
      .map((fr) => fr.tick);
    for (let i = 1; i < casts.length; i++)
      expect(casts[i] - casts[i - 1]).toBeGreaterThanOrEqual(52);
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect([fast.winner, fast.damage]).toEqual([b.winner, b.damage]);
    expect(
      compute({ kind: "replay", left, right, version: CURRENT_COMBAT_VERSION }),
    ).toEqual({ kind: "replay", battle: b });
    expect([left, right]).toEqual(before);
  });
  for (const fixture of frozen.fixtures)
    it(`0.29 ${fixture.name}逐帧冻结保持一致`, async () => {
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(simulate(fixture.left, fixture.right, "armored")),
        ),
      );
      expect(
        Array.from(new Uint8Array(hash), (x) =>
          x.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(fixture.hash);
    });
  it.each(["prepare", "battle", "result", "finished"] as const)(
    "0.29 %s只增加15份铁鸡卡池，资源战报不变",
    (phase) => {
      const g = createGame(137, "classic"),
        me = g.players[0];
      let result: ReturnType<typeof startRound> = null;
      if (phase !== "prepare") {
        if (me.shop[0]) g.pool[me.shop[0]!]++;
        me.shop[0] = phase === "finished" ? "fish" : "guard";
        g.pool[me.shop[0]]--;
        expect(buy(g, me, 0)).toBe(true);
        me.pieces[0].position = 35;
        if (phase === "finished") me.hp = 1;
        result = startRound(g);
        if (phase === "result" || phase === "finished") settle(g, result!);
      }
      expect(g.phase).toBe(phase);
      delete g.pool.ironrooster;
      const before = structuredClone(g),
        decoded = decodeSave(
          JSON.stringify({
            schema: 28,
            rules: "singleplayer-0.29",
            savedAt: 1,
            revision: 1,
            game: g,
            playback: { time: 3, speed: 2, paused: true },
          }),
        );
      expect(decoded.status).toBe("migrated");
      expect(decoded.data).toMatchObject({
        schema: SAVE_SCHEMA,
        rules: RULES.version,
        playback: { time: 3, speed: 2, paused: true },
      });
      expect(decoded.data!.game).toEqual({
        ...before,
        pool: { ...before.pool, ironrooster: COPIES[4] },
      });
      expect(validGame(decoded.data!.game)).toBe(true);
      if (phase === "battle")
        expect(resumeRound(decoded.data!.game)!.battle).toEqual(result!.battle);
    },
  );
});
