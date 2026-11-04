import { describe, expect, it } from "vitest";
import { compute } from "../src/compute/job";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  damage,
  heal,
  castSkill,
  type CombatContext,
} from "../src/engine/abilities";
import {
  enterUndying,
  expireUndying,
  isUndying,
} from "../src/engine/immortality";
import { synergies } from "../src/engine/synergies";
import { analyzeBattle } from "../src/engine/battle-analysis";
import {
  createGame,
  resumeRound,
  buy,
  startRound,
  settle,
} from "../src/engine/game";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { UNITS, IMMORTAL_ADDITIONS, COPIES, UNIT } from "../src/data/units";
import type { Fighter, Piece } from "../src/engine/types";
const p = (
  id: string,
  uid: number,
  position: number | null = 35,
  star = 1,
): Piece => ({ uid, defId: id, star, position });
const f = (id: string, uid: number, side: 0 | 1 = 0) =>
  army([p(id, uid)], side)[0];
const ctx = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 10,
  events: [],
  effects: [],
});
function soul() {
  const [vine, bone] = army([p("vine", 1, 35), p("bonedragon", 2, 43)], 0);
  const enemy = f("guard", 3, 1);
  enemy.x = vine.x + 1;
  enemy.y = vine.y;
  return { vine, bone, enemy, c: ctx(vine, bone, enemy) };
}
describe("不朽生命周期与控制", () => {
  it("两/三种上阵达成4/6秒，重复和备战不计，旧版本不启用", () => {
    const pieces = [p("vine", 1), p("bonedragon", 2, 43), p("treant", 3, 36)];
    expect(synergies(pieces)[0]).toMatchObject({
      trait: "不朽",
      tier: 2,
      bonus: { immortal: 24 },
    });
    expect(army(pieces, 0).map((x) => x.immortal?.duration)).toEqual([
      24, 24, 24,
    ]);
    pieces[2].position = null;
    expect(army(pieces, 0)[0].immortal?.duration).toBe(16);
    expect(
      army([p("vine", 1), p("vine", 2, 36)], 0)[0].immortal,
    ).toBeUndefined();
    expect(army(pieces, 0, "airsea")[0].immortal).toBeUndefined();
    expect(
      army([...pieces, p("guard", 4, 37)], 0).find((x) => x.defId === "guard")
        ?.immortal,
    ).toBeUndefined();
  });
  it("致命一击只记录真实生命，残魂免伤不供吸血、回能和额外伤害", () => {
    const { vine, enemy, c } = soul();
    vine.shield = 50;
    vine.hp = 70;
    enemy.hp = 100;
    enemy.lifesteal = 0.5;
    expect(damage(c, enemy, vine, 10000, "true")).toBe(70);
    expect(vine).toMatchObject({
      hp: 1,
      shield: 0,
      immortal: { spent: true, until: 26 },
    });
    expect(enemy.damage).toBe(70);
    expect(enemy.hp).toBe(135);
    const mana = vine.mana;
    expect(damage(c, enemy, vine, 10000, "true")).toBe(0);
    expect(c.events.at(-1)).toMatchObject({
      amount: 0,
      absorbed: 0,
      immune: true,
    });
    expect(enemy.damage).toBe(70);
    expect(enemy.hp).toBe(135);
    expect(vine.mana).toBe(mana);
    heal(c, enemy, vine, 10000);
    expect(vine.hp).toBe(1);
    expect(c.effects.filter((e) => e.kind === "immortal")).toHaveLength(1);
  });
  it("到期前仍占位、可行动可受控，到期恰好消散且只能触发一次", () => {
    const { vine, enemy, c } = soul();
    damage(c, enemy, vine, 10000, "true");
    vine.mana = 100;
    expect(castSkill(c, vine, enemy)).toBe(true);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(enemy.stunUntil).toBe(17);
    c.tick = 25;
    expireUndying(c);
    expect(isUndying(vine)).toBe(true);
    vine.stunUntil = 100;
    c.tick = 26;
    expireUndying(c);
    expect(vine.hp).toBe(0);
    expect(enterUndying(c, vine)).toBe(false);
    expireUndying(c);
    expect(c.effects.filter((e) => e.name === "残魂消散")).toHaveLength(1);
    heal(c, enemy, vine, 100);
    expect(vine.hp).toBe(0);
  });
  it("藤妖单控、骨龙范围及树妖自身范围准确，不命中友军", () => {
    for (const id of IMMORTAL_ADDITIONS) {
      const a = f(id, 1),
        b = f("guard", 2, 1),
        near = f("guard", 3, 1),
        far = f("guard", 4, 1),
        ally = f("guard", 5);
      a.x = 3;
      a.y = 4;
      b.x = 3;
      b.y = 3;
      near.x = 4;
      near.y = 3;
      far.x = 7;
      far.y = 0;
      ally.x = 2;
      ally.y = 4;
      a.mana = 100;
      const c = ctx(a, b, near, far, ally);
      expect(castSkill(c, a, b)).toBe(true);
      expect(b.stunUntil).toBeGreaterThan(c.tick);
      expect(near.hp < near.maxHp).toBe(id !== "vine");
      expect(far.hp).toBe(far.maxHp);
      expect(ally.hp).toBe(ally.maxHp);
      if (id === "treant") expect(a.shield).toBe(a.maxHp * 0.2);
      if (id === "bonedragon") expect(a.air?.flying).toBe(true);
    }
  });
  it("残魂树妖不能通过技能护盾或先锋再生恢复生命", () => {
    const [tree, bone, front] = army(
      [p("treant", 1), p("bonedragon", 2, 43), p("pangolin", 4, 36)],
      0,
    );
    const enemy = f("guard", 3, 1);
    enemy.x = tree.x + 1;
    enemy.y = tree.y;
    const c = ctx(tree, bone, front, enemy);
    expect(tree.regeneration).toBeGreaterThan(0);
    damage(c, enemy, tree, 10000, "true");
    tree.mana = 100;
    castSkill(c, tree, enemy);
    expect(tree.shield).toBe(0);
    expect(tree.hp).toBe(1);
    const b = simulate(
      [p("treant", 1), p("vine", 2, 36), p("pangolin", 4, 34)],
      [p("cannon", 11, 35, 3), p("titan", 12, 36, 3)],
    );
    expect(b.frames.flatMap((f) => f.fighters).some((f) => isUndying(f))).toBe(
      true,
    );
    for (const frame of b.frames)
      for (const fighter of frame.fighters)
        if (isUndying(fighter)) expect(fighter.hp).toBe(1);
  });
  it("魅惑不延长残魂期限，不朽不移除已有控制", () => {
    const { vine, enemy, c } = soul();
    vine.stunUntil = 20;
    damage(c, enemy, vine, 10000, "true");
    expect(vine.stunUntil).toBe(20);
    const spider = f("spider", 4, 1);
    spider.x = vine.x;
    spider.y = vine.y - 1;
    spider.mana = 100;
    c.fighters.push(spider);
    c.tick = 12;
    vine.attack = 999;
    expect(castSkill(c, spider, vine)).toBe(true);
    expect(vine.side).toBe(1);
    expect(vine.homeSide).toBe(0);
    expect(vine.immortal?.until).toBe(26);
    c.tick = 26;
    expireUndying(c);
    expect(vine.hp).toBe(0);
  });
  it("完整与轻量战果一致，生命统计不计残魂占位值且无重叠", () => {
    const left = [p("vine", 1), p("bonedragon", 2, 43), p("treant", 3, 36)],
      right = [p("titan", 11, 35, 3), p("cannon", 12, 44, 3)];
    const original = structuredClone([left, right]);
    const b = simulate(left, right),
      fast = simulateOutcome(left, right);
    expect([left, right]).toEqual(original);
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect(fast.winner).toBe(b.winner);
    expect(fast.damage).toBe(b.damage);
    const index = b.frames.findIndex((f) => f.fighters.some(isUndying));
    expect(index).toBeGreaterThan(0);
    const analysis = analyzeBattle(b, index);
    expect(analysis.sides[0].souls).toBeGreaterThan(0);
    expect(
      analysis.sides[0].fighters
        .filter((f) => f.undying)
        .every((f) => f.hp === 0),
    ).toBe(true);
    expect(analysis.sides[0].received).toBe(analysis.sides[1].damage);
    for (const frame of b.frames) {
      const alive = frame.fighters.filter((f) => f.hp > 0);
      expect(new Set(alive.map((f) => `${f.x},${f.y}`)).size).toBe(
        alive.length,
      );
    }
    if (b.winner !== null)
      expect(b.damage).toBe(
        2 +
          b.frames
            .at(-1)!
            .fighters.filter(
              (f) =>
                (f.homeSide ?? f.side) === b.winner &&
                f.hp > 0 &&
                !isUndying(f),
            )
            .reduce((n, f) => n + f.star, 0),
      );
  });
  it("原0.12的32棋子完整战斗SHA-256保持一致", async () => {
    const pieces = (start: number) =>
      UNITS.slice(start, start + 16).map((u, i) => ({
        ...p(u.id, start + i + 1, 32 + i, 2),
        items: i % 3 === 0 ? ["staff"] : [],
      }));
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify(simulate(pieces(0), pieces(16), "fleet")),
      ),
    );
    expect(
      Array.from(new Uint8Array(hash), (x) =>
        x.toString(16).padStart(2, "0"),
      ).join(""),
    ).toBe("a5d50695b4e2c756fc3b02b46c50406cc00aef28bb6681b06d888aeaa22709d7");
  });
  it("胜利时残魂不额外扣血，后台计算保留残魂和统计", () => {
    const left = [p("vine", 1), p("bonedragon", 2, 43)],
      right = [p("pangolin", 11, 35, 2)];
    const battle = simulate(left, right);
    expect(battle.winner).toBe(0);
    expect(
      battle.frames.at(-1)!.fighters.find((f) => f.uid === 1),
    ).toMatchObject({ hp: 1, immortal: { spent: true } });
    expect(battle.damage).toBe(3); // Base 2 plus the genuinely surviving one-star dragon.
    const computed = compute({ kind: "replay", left, right, version: "fleet" });
    expect(computed).toMatchObject({ kind: "replay", battle });
    const analysis = analyzeBattle(battle);
    expect(analysis.sides[0]).toMatchObject({ survivors: 1, souls: 1 });
  });
  for (const phase of ["prepare", "battle", "result", "finished"] as const)
    it(`schema11 ${phase}只补新卡池，不改资源或旧回放`, () => {
      const g = createGame(137, "classic");
      // Reconstruct an old save without new offers; preserve every old reservation.
      for (const player of g.players)
        player.shop = player.shop.map((id) => {
          if (id && IMMORTAL_ADDITIONS.includes(id)) {
            g.pool[id]++;
            return null;
          }
          return id;
        });
      for (const id of IMMORTAL_ADDITIONS) delete g.pool[id];
      if (phase !== "prepare") {
        const player = g.players[0];
        if (player.shop[0]) g.pool[player.shop[0]]++;
        player.shop[0] = "fish";
        g.pool.fish--;
        buy(g, player, 0);
        player.pieces[0].position = 35;
        if (phase === "finished") player.hp = 1;
        const battle = startRound(g)!;
        if (phase === "result" || phase === "finished") settle(g, battle);
        expect(g.phase).toBe(phase);
      }
      const oldBattle = phase === "battle" ? resumeRound(g) : null;
      const original = structuredClone(g);
      const result = decodeSave(
        JSON.stringify({
          schema: 11,
          rules: "singleplayer-0.12",
          savedAt: 1,
          revision: 1,
          game: g,
          playback: { time: 0, speed: 1, paused: false },
        }),
      );
      expect(result.status).toBe("migrated");
      expect(result.data?.schema).toBe(SAVE_SCHEMA);
      const restored = result.data!.game;
      expect(validGame(restored)).toBe(true);
      expect(restored).toEqual({
        ...original,
        pool: {
          ...original.pool,
          ...Object.fromEntries(
            IMMORTAL_ADDITIONS.map((id) => [id, COPIES[UNIT[id].cost]]),
          ),
        },
      });
      if (oldBattle)
        expect(resumeRound(restored)?.battle).toEqual(oldBattle.battle);
    });
});
