import { deployLineup, frontlineFactor } from "../src/engine/ai";
import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  damage,
  gainMana,
  type CombatContext,
} from "../src/engine/abilities";
import {
  advanceBurn,
  flameCells,
  ignite,
  silence,
} from "../src/engine/infantry-skills";
import { compute } from "../src/compute/job";
import { synergies } from "../src/engine/synergies";
import { COPIES, INFANTRY_ADDITIONS, UNIT } from "../src/data/units";
import {
  createGame,
  buy,
  startRound,
  settle,
  resumeRound,
} from "../src/engine/game";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import type { Fighter, Piece } from "../src/engine/types";
const p = (defId: string, uid: number, star = 1, position = 35): Piece => ({
  defId,
  uid,
  star,
  position,
});
const f = (id: string, uid: number, side: 0 | 1 = 0, star = 1): Fighter =>
  Object.assign(army([p(id, uid, star)], side)[0], {
    x: 3,
    y: side ? 3 : 4,
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
describe("火焰兵锥形喷火与灼烧", () => {
  it("朝向八方均命中主目标、排除背后，正向7格且边界不越界", () => {
    const from = { x: 3, y: 3 };
    for (const dx of [-1, 0, 1])
      for (const dy of [-1, 0, 1]) {
        if (!dx && !dy) continue;
        const to = { x: from.x + dx, y: from.y + dy },
          cells = flameCells(from, to);
        expect(cells).toContainEqual(to);
        expect(cells).not.toContainEqual(from);
        expect(cells).not.toContainEqual({ x: from.x - dx, y: from.y - dy });
      }
    expect(flameCells(from, { x: 3, y: 2 })).toHaveLength(7);
    expect(
      flameCells({ x: 0, y: 0 }, { x: 0, y: 1 }).every(
        (p) => p.x >= 0 && p.x < 8 && p.y >= 0 && p.y < 8,
      ),
    ).toBe(true);
  });
  it("只对锥形内敌人造成初伤和三次灼烧，伤害在施法时锁定", () => {
    const source = f("flametrooper", 1),
      target = f("turtle", 2, 1),
      side = f("turtle", 3, 1),
      behind = f("turtle", 4, 1),
      ally = f("guard", 5);
    side.x = 4;
    side.y = 2;
    behind.y = 5;
    ally.y = 3;
    const c = ctx(source, target, side, behind, ally);
    source.attack = 100;
    source.skillPower = 1.2;
    castSkill(c, source, target);
    expect(c.events.map((e) => e.target)).toEqual([2, 3]);
    expect(target.burn?.[0].damage).toBe(42);
    source.attack = 999;
    source.skillPower = 99;
    source.hp = 0; // Committed burn survives caster death.
    const hp = target.hp;
    c.tick = 13;
    advanceBurn(c);
    expect(target.hp).toBe(hp);
    for (c.tick = 14; c.tick <= 22; c.tick++) advanceBurn(c);
    expect(target.hp).toBe(hp - 126);
    expect(target.burn).toBeUndefined();
    expect(ally.hp).toBe(ally.maxHp);
    expect(behind.hp).toBe(behind.maxHp);
    expect(c.events.filter((e) => e.target === 2)).toHaveLength(4);
  });
  it("同源刷新、异源叠加；护盾吸收，残魂免伤", () => {
    const a = f("flametrooper", 1),
      b = f("flametrooper", 2),
      target = f("guard", 3, 1),
      soul = f("vine", 4, 1);
    const c = ctx(a, b, target, soul);
    ignite(c, a, target, 40);
    c.tick = 11;
    ignite(c, a, target, 50);
    ignite(c, b, target, 20);
    expect(target.burn).toHaveLength(2);
    target.shield = 60;
    const hp = target.hp;
    soul.immortal = { duration: 16, until: 40, spent: true };
    ignite(c, a, soul, 999);
    const soulHp = soul.hp;
    c.tick = 15;
    advanceBurn(c);
    expect(target.hp).toBe(hp - 10);
    expect(target.shield).toBe(0);
    expect(soul.hp).toBe(soulHp);
  });
  it("致死化蛋清除所有旧灼烧，不能把其他施法者灼烧恢复到火种", () => {
    const a = f("flametrooper", 1),
      b = f("flametrooper", 2),
      egg = f("phoenix", 3, 1, 2);
    egg.hp = 1;
    const c = ctx(a, b, egg);
    ignite(c, a, egg, 500);
    ignite(c, b, egg, 500);
    silence(c, a, egg, 8);
    c.tick = 14;
    advanceBurn(c);
    expect(egg.phoenix!.eggUntil).toBeGreaterThan(0);
    expect(egg.hp).toBe(800);
    expect(egg.burn).toBeUndefined();
    expect(egg.silenceUntil).toBeUndefined();
    ignite(c, a, egg, 999);
    expect(egg.burn).toBeUndefined();
  });
});
describe("投弹手沉默与能量封锁独立", () => {
  it("九宫格包含斜角，只命中当前敌人；三档时长及后续施法恢复", () => {
    for (const star of [1, 2, 3]) {
      const a = f("grenadier", 1, 0, star),
        target = f("guard", 2, 1),
        corner = f("guard", 3, 1),
        out = f("guard", 4, 1),
        ally = f("guard", 5);
      corner.x = 4;
      corner.y = 2;
      out.x = 5;
      ally.y = 3;
      const c = ctx(a, target, corner, out, ally);
      castSkill(c, a, target);
      expect(c.events.map((e) => e.target)).toEqual([2, 3]);
      expect(target.silenceUntil).toBe(14 + star * 4);
      expect(out.silenceUntil).toBeUndefined();
      expect(ally.silenceUntil).toBeUndefined();
      target.mana = 100;
      expect(castSkill(c, target, a)).toBe(false);
      expect(target.mana).toBe(100);
      target.mana = 50;
      gainMana(target, 25, 11);
      expect(target.mana).toBe(75);
      const hp = a.hp;
      damage(c, target, a, 10);
      expect(a.hp).toBeLessThan(hp);
      target.mana = 100;
      c.tick = target.silenceUntil!;
      expect(castSkill(c, target, a)).toBe(true);
    }
  });
  it("打断主动引导和蓄力，不取消普通攻击连击；鱼可驱散，较短重施不缩短", () => {
    const a = f("grenadier", 1),
      channel = f("medic", 2, 1),
      windup = f("arhat", 3, 1),
      hawk = f("bloodhawk", 4, 1),
      fish = f("fish", 5, 1);
    const c = ctx(a, channel, windup, hawk, fish);
    channel.hp -= 100;
    castSkill(c, channel, a);
    castSkill(c, windup, a);
    hawk.combo = { target: 1, next: 11, remaining: 2 };
    expect(channel.air?.cast).toBeDefined();
    expect(windup.windup).toBeDefined();
    for (const target of [channel, windup, hawk]) silence(c, a, target, 12);
    expect(channel.air?.cast).toBeUndefined();
    expect(windup.windup).toBeUndefined();
    expect(hawk.combo).toBeDefined();
    silence(c, a, channel, 4);
    expect(channel.silenceUntil).toBe(22);
    castSkill(c, fish, a);
    expect(channel.silenceUntil).toBeUndefined();
  });
  it("被沉默的开场被动仍能触发，能量技能被阻止", () => {
    const a = f("grenadier", 1),
      horse = f("cavalry", 2, 1),
      caster = f("stormcaller", 3, 1);
    const c = ctx(a, horse, caster);
    silence(c, a, horse, 8);
    silence(c, a, caster, 8);
    expect(castSkill(c, horse, a)).toBe(true);
    expect(castSkill(c, caster, a)).toBe(false);
  });
});
describe("步兵集成", () => {
  it("六种不同步兵触发600生命，不把重复棋子或备战算入，旧三步兵保持300", () => {
    const ids = [
      "infantry",
      "guard",
      "sniper",
      "medic",
      "flametrooper",
      "grenadier",
    ];
    const pieces = ids.map((id, i) => p(id, i + 1, 1, 32 + i));
    expect(synergies(pieces).find((s) => s.trait === "步兵")!.bonus.hp).toBe(
      600,
    );
    expect(army(pieces, 0).map((f) => f.maxHp - UNIT[f.defId].hp)).toEqual([
      600, 600, 600, 600, 600, 600,
    ]);
    expect(
      synergies(pieces.slice(0, 3)).find((s) => s.trait === "步兵")!.bonus.hp,
    ).toBe(300);
    pieces[5].position = null;
    expect(synergies(pieces).find((s) => s.trait === "步兵")!.bonus.hp).toBe(
      300,
    );
    pieces[5] = { ...pieces[0], uid: 6, position: 37 };
    expect(synergies(pieces).find((s) => s.trait === "步兵")!.bonus.hp).toBe(
      300,
    );
  });
  it("完整、快速和Worker一致，新技能均产生真实事件", () => {
    const left = [
        p("guard", 1, 3, 35),
        p("flametrooper", 2, 2, 36),
        p("grenadier", 3, 2, 43),
      ],
      right = [
        p("turtle", 4, 3, 35),
        p("medic", 5, 2, 43),
        p("arhat", 6, 2, 44),
      ];
    const b = simulate(left, right),
      fast = simulateOutcome(left, right),
      w = compute({ kind: "replay", left, right, version: "metamorph" });
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    if (w.kind === "replay") expect(w.battle).toEqual(b);
    else throw Error("wrong response");
    const effects = b.frames.flatMap((f) => f.effects);
    expect(effects.some((e) => e.kind === "burn")).toBe(true);
    expect(effects.some((e) => e.name === "沉默")).toBe(true);
  });
  for (const phase of ["prepare", "battle", "result", "finished"] as const)
    it("0.19 " + phase + "迁移只补新卡池，不改资源和回放", () => {
      const g = createGame(137);
      let battle: ReturnType<typeof startRound> | undefined;
      for (const pl of g.players)
        for (let i = 0; i < pl.shop.length; i++)
          if (INFANTRY_ADDITIONS.includes(pl.shop[i] ?? "")) {
            g.pool[pl.shop[i]!]++;
            pl.shop[i] = "infantry";
            g.pool.infantry--;
          }
      for (const id of INFANTRY_ADDITIONS) g.pool[id] = 0;
      if (phase !== "prepare") {
        const player = g.players[0];
        if (player.shop[0]) g.pool[player.shop[0]]++;
        player.shop[0] = phase === "finished" ? "fish" : "guard";
        g.pool[player.shop[0]]--;
        buy(g, player, 0);
        player.pieces[0].position = 35;
        if (phase === "finished") player.hp = 1;
        battle = startRound(g);
        if (phase === "result" || phase === "finished") settle(g, battle!);
      }
      expect(g.phase).toBe(phase);
      expect(
        g.players
          .flatMap((p) => p.pieces)
          .some((p) => INFANTRY_ADDITIONS.includes(p.defId)),
      ).toBe(false);
      for (const id of INFANTRY_ADDITIONS) delete g.pool[id];
      const before = structuredClone(g);
      const decoded = decodeSave(
        JSON.stringify({
          schema: 18,
          rules: "singleplayer-0.19",
          savedAt: 1,
          revision: 1,
          game: g,
          playback: { time: 0, speed: 1, paused: false },
        }),
      );
      expect(decoded.status).toBe("migrated");
      expect(decoded.data?.schema).toBe(SAVE_SCHEMA);
      expect(decoded.data!.game).toEqual({
        ...before,
        pool: { ...before.pool, flametrooper: COPIES[2], grenadier: COPIES[4] },
      });
      expect(validGame(decoded.data!.game)).toBe(true);
      if (phase === "battle")
        expect(resumeRound(decoded.data!.game)!.battle).toEqual(battle!.battle);
    });
});

it("火焰兵按近线保护放置，投弹手仍在后排", () => {
  const player = createGame(137).players[1];
  player.level = 3;
  player.pieces = [
    p("flametrooper", 1, 2),
    p("grenadier", 2, 2),
    p("infantry", 3, 2),
  ];
  expect(frontlineFactor(player.pieces)).toBeGreaterThan(
    frontlineFactor([p("sniper", 1, 2), player.pieces[1], player.pieces[2]]),
  );
  for (const formation of ["spread", "compact"] as const) {
    deployLineup(player, "standard", formation);
    expect(player.pieces[0].position).toBeLessThan(40);
    expect(player.pieces[1].position).toBeGreaterThanOrEqual(48);
    expect(new Set(player.pieces.map((p) => p.position)).size).toBe(3);
  }
});
