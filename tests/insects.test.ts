import { CURRENT_COMBAT_VERSION,type CombatVersion } from "../src/engine/types";
import { describe, it, expect } from "vitest";
import {
  createGame,
  buy,
  sell,
  merge,
  startRound,
  resumeRound,
  settle,
  nextRound,
} from "../src/engine/game";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  damage,
  castSkill,
  gainMana,
  type CombatContext,
} from "../src/engine/abilities";
import { salePrice, mergeCount } from "../src/engine/progression";
import { synergies } from "../src/engine/synergies";
import { skillReady, usesEnergy } from "../src/engine/triggers";
import { validGame, decodeSave, SAVE_SCHEMA } from "../src/engine/persistence";
import { COPIES, BROOD_ADDITIONS, UNIT } from "../src/data/units";
import { claimReward } from "../src/engine/equipment";
import { analyzeBattle } from "../src/engine/battle-analysis";
import type { Piece, Fighter } from "../src/engine/types";
const piece = (
  defId: string,
  uid: number,
  star = 1,
  position: number | null = null,
  copies?: number,
): Piece => ({
  defId,
  uid,
  star,
  position,
  ...(copies === undefined ? {} : { copies }),
});
function board() {
  const g = createGame(137, "classic"),
    p = g.players[0];
  p.gold = 100;
  const give = (id: string) => {
    if (p.shop[0]) g.pool[p.shop[0]!]++;
    p.shop[0] = id;
    g.pool[id]--;
    expect(buy(g, p, 0)).toBe(true);
  };
  return { g, p, give };
}
function context(source: Fighter, ...others: Fighter[]): CombatContext {
  return { fighters: [source, ...others], tick: 1, events: [], effects: [] };
}
function fighter(id: string, uid: number, side: 0 | 1 = 0, star = 1,version:CombatVersion=CURRENT_COMBAT_VERSION) {
  return army([piece(id, uid, star, side === 0 ? 35 : 36)], side,version)[0];
}
describe("异虫进化与实际卡池份数", () => {
  it("备战席计不同种类，2/4种降低相应星级门槛，旧版不受影响", () => {
    const p = [piece("eyebug", 1), piece("blastbug", 2), piece("eyebug", 3)];
    expect(synergies(p).find((s) => s.trait === "异虫")).toMatchObject({
      count: 2,
      tier: 1,
    });
    expect(mergeCount(p, "eyebug", 1)).toBe(2);
    expect(mergeCount(p, "eyebug", 2)).toBe(3);
    p.push(piece("spider", 4), piece("wasp", 5));
    expect(mergeCount(p, "eyebug", 2)).toBe(2);
    expect(mergeCount(p, "guard", 1)).toBe(3);
    expect(mergeCount(p, "eyebug", 1, "legions")).toBe(3);
    expect(synergies(p, "legions")).toHaveLength(0);
  });
  it("先三合一再二合一可混合进化，装备溢出归库存且保留部署位置", () => {
    const { p } = board();
    p.pieces = [
      piece("eyebug", 1, 2, 35),
      piece("eyebug", 2, 2, null, 2),
      piece("blastbug", 3),
      piece("spider", 4),
      piece("wasp", 5),
    ];
    p.pieces[0].items = ["staff", "armor", "sword"];
    p.pieces[1].items = ["bow", "cloak"];
    merge(p);
    const eye = p.pieces.find((p) => p.defId === "eyebug")!;
    expect(eye).toMatchObject({
      uid: 1,
      star: 3,
      position: 35,
      copies: 5,
      items: ["staff", "armor", "sword"],
    });
    expect(p.inventory).toEqual(["bow", "cloak"]);
  });
  it("两枚眼虫升星后卖3金，只向共享卡池返还两份", () => {
    const { g, p, give } = board();
    give("blastbug");
    give("eyebug");
    give("eyebug");
    expect(validGame(g)).toBe(true);
    const eye = p.pieces.find((p) => p.defId === "eyebug")!,
      pool = g.pool.eyebug,
      gold = p.gold;
    expect(eye).toMatchObject({ star: 2, copies: 2 });
    expect(salePrice(eye)).toBe(3);
    sell(g, p, eye.uid);
    expect(g.pool.eyebug).toBe(pool + 2);
    expect(p.gold).toBe(gold + 3);
    expect(validGame(g)).toBe(true);
    expect(salePrice(piece("spider", 999, 2, null, 2))).toBe(5);
  });
  it("满备战席可购买新种类触发已有异虫合并；失败购买不花钱或消耗UID", () => {
    const { g, p } = board();
    p.pieces = [
      piece("eyebug", 1),
      piece("eyebug", 2),
      ...Array.from({ length: 6 }, (_, i) =>
        piece(
          ["guard", "infantry", "panda", "monk", "wolf", "tiger"][i],
          i + 3,
        ),
      ),
    ];
    g.nextUid = 9;
    p.shop[0] = "blastbug";
    expect(buy(g, p, 0)).toBe(true);
    expect(p.pieces).toHaveLength(8);
    expect(p.pieces.find((p) => p.defId === "eyebug")?.star).toBe(2);
    p.shop[0] = "shark";
    const before = structuredClone(g);
    expect(buy(g, p, 0)).toBe(false);
    expect(g).toEqual(before);
  });
  it("四种异虫四枚升三星，淘汰退回实际份数，伪造份数存档被拒绝", () => {
    const { g, p, give } = board();
    for (const id of [
      "blastbug",
      "spider",
      "wasp",
      "eyebug",
      "eyebug",
      "eyebug",
      "eyebug",
    ])
      give(id);
    const eye = p.pieces.find((p) => p.defId === "eyebug")!;
    expect(eye).toMatchObject({ star: 3, copies: 4 });
    expect(validGame(g)).toBe(true);
    eye.copies = 3;
    expect(validGame(g)).toBe(false);
    eye.copies = 4;
    p.level = 4;
    p.pieces.forEach((x, i) => (x.position = 32 + i));
    p.hp = 1;
    const r = startRound(g)!;
    r.battle.winner = 1;
    r.battle.damage = 100;
    r.outcomes.find((o) => o.playerId === 0)!.damage = 100;
    settle(g, r);
    expect(p.hp).toBe(0);
    expect(p.pieces).toHaveLength(0);
    expect(validGame(g)).toBe(true);
  });
});
describe("异虫战斗技能", () => {
  it("旧版爆裂虫无能量，阵亡爆炸按最大生命和法强造成范围伤害，连锁每只仅一次", () => {
    const a = fighter("blastbug", 1, 0, 1,"sea-fog"),
      b = fighter("blastbug", 2, 1, 1,"sea-fog"),
      near = fighter("guard", 3, 1),
      far = fighter("guard", 4, 1);
    Object.assign(a, { x: 3, y: 3 });
    Object.assign(b, { x: 4, y: 3, hp: 100 });
    Object.assign(near, { x: 3, y: 4 });
    Object.assign(far, { x: 7, y: 7 });
    const ctx = context(a, b, near, far);
    a.skillPower = 1.5;
    gainMana(a, 100, 1);
    expect(a.mana).toBe(0);
    expect(skillReady(a)).toBe(false);
    damage(ctx, b, a, 10000, "true");
    expect(ctx.effects.filter((e) => e.kind === "cast")).toHaveLength(2);
    expect(a.deathBurst).toBe("spent");
    expect(b.deathBurst).toBe("spent");
    expect(near.hp).toBe(near.maxHp - Math.round(a.maxHp * 0.35 * 1.5 * 0.8));
    expect(far.hp).toBe(far.maxHp);
    const count = ctx.events.length;
    damage(ctx, near, a, 1000);
    expect(ctx.events).toHaveLength(count);
  });
  it("眼虫造成法术伤害与1.5秒眩晕，杀人蜂无近身目标不消耗能量", () => {
    const eye = fighter("eyebug", 1),
      target = fighter("guard", 2, 1);
    eye.mana = 100;
    const ctx = context(eye, target);
    expect(castSkill(ctx, eye, target)).toBe(true);
    expect(target.stunUntil).toBe(8);
    expect(ctx.events[0].damageType).toBe("magic");
    const bee = fighter("wasp", 3);
    bee.mana = 100;
    bee.x = 0;
    bee.y = 0;
    ctx.fighters.push(bee);
    expect(castSkill(ctx, bee, target)).toBe(false);
    expect(bee.mana).toBe(100);
    bee.x = target.x;
    bee.y = target.y + 1;
    expect(castSkill(ctx, bee, target)).toBe(true);
    expect(ctx.events.at(-1)?.attacker).toBe(bee.uid);
  });
  it("旧版蜘蛛魅惑范围内最强非召唤敌人，控制期间不可施法或回能，每场一次", () => {
    const spider = army([piece("spider",1,1,35)],0,"support-actions")[0],
      weak = fighter("guard", 2, 1),
      strong = fighter("titan", 3, 1),
      pet = fighter("guard", 4, 1);
    spider.mana = 100;
    Object.assign(pet, { attack: 9999, summon: { owner: 2, born: 0 } });
    const ctx = context(spider, weak, strong, pet),
      attack = strong.attack;
    expect(castSkill(ctx, spider, weak)).toBe(true);
    expect(strong.side).toBe(0);
    expect(strong.homeSide).toBe(1);
    expect(strong.attack).toBeCloseTo(attack * 1.2);
    expect(strong.charm?.until).toBe(9);
    expect(pet.side).toBe(1);
    expect(usesEnergy(strong)).toBe(false);
    expect(skillReady(strong)).toBe(false);
    strong.mana = 0;
    gainMana(strong, 100, 1);
    expect(strong.mana).toBe(0);
    spider.mana = 100;
    expect(castSkill(ctx, spider, weak)).toBe(false);
    damage(ctx, weak, spider, 99999, "true");
    expect(strong.charm).toBeDefined();
  });
  it("魅惑最后一个敌人不会直接判胜，到期恢复攻击及阵营，完整/快速模拟一致", () => {
    const left = [{ ...piece("spider", 1, 1, 35), items: ["staff"] }],
      right = [piece("guard", 2, 2, 36)];
    const b = simulate(left, right),
      fast = simulateOutcome(left, right);
    const frame = b.frames.find((f) => f.fighters.some((x) => x.charm))!,
      controlled = frame.fighters.find((f) => f.charm)!;
    expect(controlled.side).toBe(0);
    expect(b.frames.at(-1)!.tick).toBeGreaterThan(controlled.charm!.until);
    const restored = b.frames
      .find((f) => f.tick === controlled.charm!.until)!
      .fighters.find((f) => f.uid === 2)!;
    expect(restored.side).toBe(1);
    expect(restored.attack).toBe(controlled.charm!.attack);
    expect(restored.charm).toBeUndefined();
    expect(
      analyzeBattle(b, frame.tick).sides[1].fighters.map((f) => f.uid),
    ).toContain(2);
    expect(fast).toMatchObject({ winner: b.winner, damage: b.damage });
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
  });
  it("旧brood异能仅统计上阵两种，敌人所有回能按75%计算，legions无此效果", () => {
    const left = [piece("spider", 1, 1, 35), piece("eyebug", 2, 1, 43)],
      right = [piece("guard", 3, 1, 36)];
    const b = simulate(left, right, "brood"),
      enemy = b.frames[0].fighters.find((f) => f.uid === 3)!;
    expect(enemy.energyMultiplier).toBe(0.75);
    enemy.mana = 0;
    gainMana(enemy, 25, 1);
    expect(enemy.mana).toBe(18.75);
    const ally = b.frames[0].fighters[0];
    damage(context(ally, enemy), ally, enemy, 1, "true");
    expect(enemy.mana).toBe(26.25);
    left[1].position = null;
    expect(
      simulate(left, right, "brood").frames[0].fighters.find(
        (f) => f.uid === 3,
      )!.energyMultiplier,
    ).toBe(1);
    expect(
      simulate(left, right, "legions").frames[0].fighters.every(
        (f) => f.energyMultiplier === undefined,
      ),
    ).toBe(true);
  });
});
describe("0.9存档迁移", () => {
  for (const phase of ["prepare", "battle", "result"] as const)
    it(`${phase}保留资源、战报和进行中的规则`, () => {
      const g = createGame(137, "classic");
      g.combatVersion = "legions";
      // An old roster cannot contain an insect shop reservation.
      for (const p of g.players)
        for (let i = 0; i < p.shop.length; i++)
          if (BROOD_ADDITIONS.includes(p.shop[i]!)) {
            g.pool[p.shop[i]!]++;
            p.shop[i] = null;
          }
      const p = g.players[0],
        index = p.shop.findIndex(Boolean);
      buy(g, p, index);
      p.pieces[0].position = 35;
      if (phase !== "prepare") {
        g.phase = "battle";
        if (phase === "result") settle(g, resumeRound(g)!);
      }
      for (const id of BROOD_ADDITIONS) delete g.pool[id];
      const decoded = decodeSave(
        JSON.stringify({
          schema: 8,
          rules: "singleplayer-0.9",
          savedAt: 1,
          revision: 1,
          game: g,
          playback: { time: 0, speed: 1, paused: false },
        }),
      );
      expect(decoded.status).toBe("migrated");
      expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
      const restored = decoded.data!.game;
      expect(validGame(restored)).toBe(true);
      expect(restored.players).toEqual(g.players);
      expect(restored.history).toEqual(g.history);
      expect(restored.combatVersion).toBe(
        phase === "prepare" ? CURRENT_COMBAT_VERSION : "legions",
      );
      for (const id of BROOD_ADDITIONS)
        expect(restored.pool[id]).toBe(COPIES[UNIT[id].cost]);
      if (phase === "result") {
        if (restored.reward) claimReward(restored, 0);
        nextRound(restored);
        expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
      }
    });
});
