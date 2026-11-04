import { CURRENT_COMBAT_VERSION } from "../src/engine/types";
import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  damage,
  advanceAirSkills,
  combatAttack,
  type CombatContext,
} from "../src/engine/abilities";
import { skillReady, attackTargets } from "../src/engine/triggers";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { lineupScore, pieceStrength, deployLineup } from "../src/engine/ai";
import { AI_PROFILES } from "../src/data/ai-profiles";
import { synergies } from "../src/engine/synergies";
import {
  createGame,
  buy,
  resumeRound,
  settle,
  nextRound,
} from "../src/engine/game";
import { claimReward } from "../src/engine/equipment";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import { AIRSEA_ADDITIONS, UNITS, UNIT, COPIES } from "../src/data/units";
import type { Fighter, Piece } from "../src/engine/types";
const p = (id: string, uid: number, position = 35, star = 1): Piece => ({
  defId: id,
  uid,
  position,
  star,
});
const f = (id: string, uid: number, side: 0 | 1 = 0, x = 3, y = 3): Fighter =>
  Object.assign(army([p(id, uid)], side)[0], { x, y, mana: 100 });
const ctx = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 10,
  events: [],
  effects: [],
});
describe("空海羁绊与攻击结算", () => {
  it("空军保护所有飞行棋子，海神只对飞行生效；同名和备战席不重复计数", () => {
    const ids = [
      "repair",
      "bomber",
      "ghostjet",
      "ark",
      "fish",
      "shark",
      "skycrab",
      "eel",
      "guard",
      "eyebug",
    ];
    const pieces = ids.map((id, i) => p(id, i + 1, 32 + i));
    const team = army(pieces, 0, "airsea");
    expect(
      team
        .filter((x) => x.air?.flying)
        .every((x) => x.air!.evasion === 0.3 && x.air!.seaMana === 20),
    ).toBe(true);
    expect(team.find((x) => x.defId === "guard")!.air).toMatchObject({
      flying: false,
      evasion: 0,
      seaMana: 0,
    });
    pieces[3].position = null;
    pieces.push(p("repair", 30, 60));
    expect(synergies(pieces).find((s) => s.trait === "空军")).toMatchObject({
      count: 3,
      tier: 1,
    });
    expect(army(pieces, 0, "brood").every((x) => !x.air)).toBe(true);
    expect(
      synergies(pieces, "brood").some((s) =>
        ["空军", "海神", "攻城", "爆破"].includes(s.trait),
      ),
    ).toBe(false);
  });
  it("闪避不扣生命护盾、不触发受击回能/破甲/吸血，技能无法被闪避", () => {
    const a = f("infantry", 1),
      b = f("bomber", 2, 1),
      c = ctx(a, b);
    a.hp = 100;
    a.lifesteal = 1;
    a.attackShred = 4;
    b.air!.evasion = 1;
    b.mana = 0;
    b.shield = 50;
    const before = b.hp;
    expect(damage(c, a, b, 100)).toBe(0);
    expect(b).toMatchObject({ hp: before, shield: 50, mana: 0, armorBreak: 0 });
    expect(a.hp).toBe(100);
    expect(c.events[0].evaded).toBe(true);
    damage(c, a, b, 100, "magic", true);
    expect(b.hp).toBeLessThan(before);
    expect(b.mana).toBe(10);
  });
  it("闪避序列可复现且同时包含命中和闪避，分析记录真实闪避次数", () => {
    const build = () => {
      const a = f("infantry", 1),
        b = f("bomber", 2, 1);
      b.air!.evasion = 0.3;
      b.hp = b.maxHp = 100000;
      return ctx(a, b);
    };
    const a = build(),
      b = build();
    for (let tick = 0; tick < 100; tick++)
      for (const c of [a, b]) {
        c.tick = tick;
        damage(c, c.fighters[0], c.fighters[1], 1);
      }
    expect(a).toEqual(b);
    const count = a.events.filter((e) => e.evaded).length;
    expect(count).toBeGreaterThan(10);
    expect(count).toBeLessThan(50);
    const analysis = analyzeBattle({
      frames: [{ ...a, tick: 100 }],
      winner: null,
      damage: 3,
    });
    expect(analysis.sides[1].fighters[0].evades).toBe(count);
  });
  it("巨神炮优先飞行目标，普攻加成50%且必中；隐身目标仍不可见", () => {
    const cannon = f("cannon", 1),
      air = f("bomber", 2, 1),
      ground = f("guard", 3, 1);
    air.air!.evasion = 1;
    air.armor = 0;
    expect(damage(ctx(cannon, air), cannon, air, 100)).toBe(150);
    air.air!.phaseUntil = 20;
    expect(
      attackTargets(cannon, [cannon, air, ground], 10).map((x) => x.uid),
    ).toEqual([3]);
    const b = simulate(
      [p("cannon", 1, 35)],
      [p("guard", 3, 35), p("bomber", 2, 42)],
    );
    expect(
      b.frames
        .flatMap((frame) => frame.events)
        .find((e) => e.attacker === 1 && e.primary)!.target,
    ).toBe(2);
  });
  it("海神按实际扣血回能、同一步只触发一次，并服从封能和异能压制", () => {
    const a = f("eel", 1),
      b = f("guard", 2, 1),
      c = ctx(a, b);
    a.mana = 0;
    a.air!.seaMana = 20;
    a.energyMultiplier = 0.75;
    b.shield = 100;
    damage(c, a, b, 50, "true", true);
    expect(a.mana).toBe(0);
    damage(c, a, b, 100, "true", true);
    damage(c, a, b, 1, "true", true);
    expect(a.mana).toBe(15);
    c.tick++;
    a.manaLockUntil = c.tick + 1;
    damage(c, a, b, 1, "true", true);
    expect(a.mana).toBe(15);
    c.tick++;
    damage(c, a, b, 1, "true", true);
    expect(a.mana).toBe(30);
  });
  it("攻城只增幅指定类型的普攻，爆破降低敌方法术减伤并传递给后续召唤物", () => {
    const pieces = ["chariot", "bull", "cannon"].map((id, i) =>
      p(id, i + 1, 32 + i),
    );
    const a = army(pieces, 0)[0],
      b = f("bomber", 20, 1),
      c = ctx(a, b);
    b.armor = 0;
    expect(damage(c, a, b, 100)).toBe(115);
    expect(damage(c, a, b, 100, "true", true)).toBe(100);
    const battle = simulate(
      [p("blastbug", 1), p("bomber", 2, 36), p("titan", 3, 34)],
      [{ ...p("adept", 4, 43), items: ["staff"] }, p("guard", 5, 35)],
    );
    const initial = battle.frames[0].fighters.find((x) => x.uid === 4)!;
    expect(initial.magicResist).toBeCloseTo(0.1);
    const pet = battle.frames.flatMap((x) => x.fighters).find((x) => x.summon);
    expect(pet).toBeDefined();
    expect(pet!.magicResist).toBeCloseTo(0.1);
    expect(pet!.air?.flying).toBe(false);
  });
});
describe("空海独立技能与中断", () => {
  it("维修选择范围内攻击最高者，治疗不溢出，同种强化不叠加且按时失效", () => {
    const repair = f("repair", 1),
      strong = f("ark", 2, 0, 4, 3),
      far = f("titan", 3, 0, 7, 7),
      enemy = f("guard", 4, 1),
      c = ctx(repair, strong, far, enemy);
    strong.hp = strong.maxHp - 20;
    far.attack = 9999;
    castSkill(c, repair, enemy);
    expect(strong.hp).toBe(strong.maxHp);
    expect(repair.healing).toBe(20);
    expect(combatAttack(strong, 10)).toBeCloseTo(strong.attack * 1.25);
    repair.star = 3;
    repair.mana = 100;
    c.tick = 12;
    castSkill(c, repair, enemy);
    repair.star = 1;
    repair.mana = 100;
    c.tick = 13;
    castSkill(c, repair, enemy);
    expect(strong.attackBoost).toMatchObject({ until: 29, ratio: 0.45 });
    expect(combatAttack(strong, 29)).toBe(strong.attack);
    repair.mana = 100;
    c.tick = 30;
    castSkill(c, repair, enemy);
    expect(strong.attackBoost!.ratio).toBe(0.25);
  });
  it("幽灵机跃向残血敌人，2秒隐身挡普攻但不挡范围技能", () => {
    const a = f("ghostjet", 1, 0, 0, 7),
      b = f("guard", 2, 1, 4, 2),
      c = ctx(a, b);
    b.hp = 300;
    expect(castSkill(c, a, b)).toBe(true);
    expect(a.air!.phaseUntil).toBe(18);
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
    expect(attackTargets(b, c.fighters, 17)).toHaveLength(0);
    expect(attackTargets(b, c.fighters, 18)).toHaveLength(1);
    const hp = a.hp;
    damage(c, b, a, 100, "magic", true);
    expect(a.hp).toBeLessThan(hp);
  });
  it("空蟹只狙杀射程内攻击最高敌人", () => {
    const a = f("skycrab", 1),
      weak = f("guard", 2, 1, 3, 4),
      strong = f("titan", 3, 1, 4, 3),
      far = f("titan", 4, 1, 7, 7);
    far.attack = 99999;
    const c = ctx(a, weak, strong, far);
    castSkill(c, a, weak);
    expect(c.events).toHaveLength(1);
    expect(c.events[0]).toMatchObject({
      target: 3,
      damageType: "magic",
      amount: Math.round(a.attack * 4.5 * 0.8),
    });
  });
  it("方舟蓄力1秒后沿原方向贯穿，离开弹道的目标可躲开", () => {
    const a = f("ark", 1, 0, 3, 6),
      b = f("guard", 2, 1, 3, 4),
      behind = f("guard", 3, 1, 3, 1),
      c = ctx(a, b, behind);
    castSkill(c, a, b);
    expect(c.events).toHaveLength(0);
    expect(skillReady(a)).toBe(false);
    c.tick = 13;
    advanceAirSkills(c, a);
    expect(c.events).toHaveLength(0);
    b.x = 5;
    c.tick = 14;
    advanceAirSkills(c, a);
    expect(c.events.map((e) => e.target)).toEqual([3]);
    expect(a.air!.cast).toBeUndefined();
  });
  it("电蛟雷场每秒一次、每次最多4人，区域内外移动动态影响后续命中", () => {
    const a = f("eel", 1, 0, 3, 6),
      enemies = [
        [3, 3],
        [3, 2],
        [2, 3],
        [4, 3],
        [3, 4],
      ].map(([x, y], i) => f("titan", i + 2, 1, x, y)),
      c = ctx(a, ...enemies);
    castSkill(c, a, enemies[0]);
    c.tick = 11;
    advanceAirSkills(c, a);
    expect(c.events).toHaveLength(4);
    enemies[0].x = 0;
    enemies[0].y = 0;
    c.events = [];
    c.tick = 15;
    advanceAirSkills(c, a);
    expect(c.events.map((e) => e.target)).not.toContain(2);
    expect(c.events).toHaveLength(4);
    c.events = [];
    c.tick = 19;
    advanceAirSkills(c, a);
    expect(c.effects.filter((e) => e.kind === "pulse")).toHaveLength(3);
    expect(a.air!.cast).toBeUndefined();
  });
  it("轰炸护甲强化，施法期间不移动不普攻；眩晕、魅惑和阵亡即时中断", () => {
    for (const interrupt of ["stun", "charm", "death"]) {
      const a = f("bomber", 1),
        enemy = f(
          interrupt === "stun"
            ? "eyebug"
            : interrupt === "charm"
              ? "spider"
              : "guard",
          2,
          1,
          3,
          4,
        ),
        c = ctx(a, enemy);
      castSkill(c, a, enemy);
      expect(a.armorBuff).toBe(8);
      expect(a.armorBuffUntil).toBe(22);
      if (interrupt === "death") damage(c, enemy, a, 99999, "true");
      else castSkill(c, enemy, a);
      expect(a.air!.cast).toBeUndefined();
      c.tick = 11;
      expect(advanceAirSkills(c, a)).toBe(false);
      expect(c.effects.some((e) => e.name === "施法中断")).toBe(true);
    }
    const b = simulate(
      [{ ...p("bomber", 1), items: ["staff", "staff"] }],
      [p("guard", 2, 36, 3)],
    );
    const first = b.frames.find(
      (frame) => frame.fighters.find((x) => x.uid === 1)?.air?.cast,
    )!;
    const start = first.fighters.find((x) => x.uid === 1)!;
    expect(start.air?.cast).toBeDefined();
    for (const frame of b.frames.filter(
      (frame) =>
        frame.tick > first.tick &&
        frame.fighters.find((x) => x.uid === 1)?.air?.cast,
    )) {
      expect(frame.events.some((e) => e.attacker === 1 && !e.skill)).toBe(
        false,
      );
      expect(frame.fighters.find((x) => x.uid === 1)).toMatchObject({
        x: start.x,
        y: start.y,
      });
    }
  });
  it("完整和快速模拟一致，输入不变，新增字段不改旧版26棋子战斗快照", async () => {
    const left = AIRSEA_ADDITIONS.map((id, i) => ({
        ...p(id, i + 1, 32 + i, 2),
        items: ["staff"],
      })),
      right = ["cannon", "eyebug", "spider", "shark", "titan", "guard"].map(
        (id, i) => p(id, i + 101, 32 + i, 2),
      );
    const before = structuredClone([left, right]),
      b = simulate(left, right),
      fast = simulateOutcome(left, right);
    expect([left, right]).toEqual(before);
    expect(fast).toMatchObject({ winner: b.winner, damage: b.damage });
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect(simulate(left, right)).toEqual(b);
    const old = simulate(
      UNITS.slice(0, 13).map((u, i) => p(u.id, i + 1, 32 + i, 2)),
      UNITS.slice(13, 26).map((u, i) => p(u.id, i + 101, 32 + i, 2)),
      "brood",
    );
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(old)),
    );
    expect(
      Array.from(new Uint8Array(hash), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join(""),
    ).toBe("d64ea8ccc3565028522127832a6332def8bcb486a22aefa3a3609966a0098420");
  });
});
describe("空海选阵估值", () => {
  it("维修强化随主力增强计入团队价值，轰炸机推荐靠前部署", () => {
    const support = [p("repair", 1, 51, 2)],
      weak = [p("ark", 2, 60)],
      strong = [p("ark", 2, 60, 3)];
    const surplus = (carry: Piece[]) =>
      lineupScore([...support, ...carry], AI_PROFILES[0]) -
      lineupScore(carry, AI_PROFILES[0]) -
      pieceStrength(support[0]);
    expect(surplus(strong)).toBeGreaterThan(surplus(weak));
    const player = createGame(137, "classic").players[0];
    player.level = 3;
    player.pieces = [p("bomber", 1), p("repair", 2), p("ark", 3)];
    deployLineup(player, "standard");
    expect(
      player.pieces.find((p) => p.defId === "bomber")!.position,
    ).toBeLessThan(40);
    expect(
      player.pieces.find((p) => p.defId === "ark")!.position,
    ).toBeGreaterThanOrEqual(48);
  });
});
describe("0.10存档迁移", () => {
  for (const phase of ["prepare", "battle", "result"] as const)
    it(`${phase}补齐空海卡池但保留当前资源和旧战报`, () => {
      const g = createGame(137, "classic");
      g.combatVersion = "brood";
      for (const player of g.players)
        for (let i = 0; i < player.shop.length; i++)
          if (AIRSEA_ADDITIONS.includes(player.shop[i]!)) {
            g.pool[player.shop[i]!]++;
            player.shop[i] = null;
          }
      const player = g.players[0];
      buy(g, player, player.shop.findIndex(Boolean));
      player.pieces[0].position = 35;
      if (phase !== "prepare") {
        g.phase = "battle";
        if (phase === "result") settle(g, resumeRound(g)!);
      }
      for (const id of AIRSEA_ADDITIONS) delete g.pool[id];
      const result = decodeSave(
        JSON.stringify({
          schema: 9,
          rules: "singleplayer-0.10",
          savedAt: 1,
          revision: 1,
          game: g,
          playback: { time: 0, speed: 1, paused: false },
        }),
      );
      expect(result.status).toBe("migrated");
      expect(result.data!.schema).toBe(SAVE_SCHEMA);
      const restored = result.data!.game;
      expect(validGame(restored)).toBe(true);
      expect(restored.players).toEqual(g.players);
      expect(restored.history).toEqual(g.history);
      expect(restored.combatVersion).toBe(
        phase === "prepare" ? CURRENT_COMBAT_VERSION : "brood",
      );
      for (const id of AIRSEA_ADDITIONS)
        expect(restored.pool[id]).toBe(COPIES[UNIT[id].cost]);
      if (phase === "result") {
        if (restored.reward) claimReward(restored, 0);
        nextRound(restored);
        expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
      }
    });
});
