import { describe, expect, it } from "vitest";
import { army } from "../src/engine/battle";
import { castSkill, damage, type CombatContext } from "../src/engine/abilities";
import {
  bullTransformation,
  bullFormPose,
  deathFade,
} from "../src/render/combat-presentation";
import { REST_POSE } from "../src/render/melee";
import type { Battle } from "../src/engine/types";

function fixture(adjacent = false) {
  const fighters = [
    ...army([{ uid: 1, defId: "bull", star: 2, position: 49 }], 0),
    ...army([{ uid: 2, defId: "guard", star: 3, position: 34 }], 1),
  ];
  const [bull, enemy] = fighters;
  Object.assign(enemy, adjacent ? { x: 1, y: 5 } : { x: 5, y: 2 });
  bull.mana = 100;
  const battle: Battle = {
    frames: [
      { tick: 0, fighters: structuredClone(fighters), events: [], effects: [] },
    ],
    winner: null,
    damage: 3,
  };
  const ctx: CombatContext = { tick: 1, fighters, events: [], effects: [] };
  expect(castSkill(ctx, bull, enemy)).toBe(true);
  battle.frames.push(structuredClone(ctx));
  for (let tick = 2; tick < 6; tick++)
    battle.frames.push({
      tick,
      fighters: structuredClone(fighters),
      events: [],
      effects: [],
    });
  return { battle, bull };
}
describe("牛魔变身与短生命周期绘制", () => {
  it("成功施法才出现形态，不能从未来帧提前读取技能", () => {
    const { battle, bull } = fixture();
    expect(bullTransformation(battle, bull, 0.99)).toBeNull();
    const form = bullTransformation(battle, bull, 1)!;
    expect(form).toMatchObject({
      start: 1,
      progress: 0,
      alpha: 0,
      moving: true,
      position: { x: 1, y: 6 },
    });
    expect(bullTransformation(battle, bull, 4.21)).toBeNull();
    expect(
      bullTransformation(battle, { ...bull, defId: "cavalry" }, 2),
    ).toBeNull();
  });
  it("冲锋沿起终点移动，巨牛形态展开再复原，读帧不改变战斗", () => {
    const { battle, bull } = fixture(),
      before = structuredClone(battle);
    const start = bullTransformation(battle, bull, 1)!;
    for (let time = 1; time < 4.2; time += 0.02) {
      const form = bullTransformation(battle, bull, time)!;
      expect(form.position.x).toBeGreaterThanOrEqual(
        Math.min(start.from.x, start.to.x),
      );
      expect(form.position.x).toBeLessThanOrEqual(
        Math.max(start.from.x, start.to.x),
      );
      expect(form.position.y).toBeGreaterThanOrEqual(
        Math.min(start.from.y, start.to.y),
      );
      expect(form.position.y).toBeLessThanOrEqual(
        Math.max(start.from.y, start.to.y),
      );
      expect(form.alpha).toBeGreaterThanOrEqual(0);
      expect(form.alpha).toBeLessThanOrEqual(1);
      expect(Object.values(bullFormPose(form)).every(Number.isFinite)).toBe(
        true,
      );
    }
    const middle = bullTransformation(battle, bull, 2)!;
    expect(middle.position).toEqual(middle.to);
    expect(middle.alpha).toBe(1);
    expect(bullTransformation(battle, bull, 4.19)!.alpha).toBeLessThan(0.02);
    expect(battle).toEqual(before);
  });
  it("相邻目标原地变身；减少动态效果时保留形态但不位移或拉伸", () => {
    const { battle, bull } = fixture(true);
    const form = bullTransformation(battle, bull, 2)!;
    expect(form.moving).toBe(false);
    expect(form.from).toEqual(form.to);
    const distant = fixture();
    const reduced = bullTransformation(
      distant.battle,
      distant.bull,
      1.1,
      true,
    )!;
    expect(reduced.position).toEqual({ x: distant.bull.x, y: distant.bull.y });
    expect(reduced.alpha).toBe(1);
    expect(bullFormPose(reduced, true)).toEqual(REST_POSE);
  });
  it("后续普攻和阵亡会中断形态；不成功施法不会生成假变身", () => {
    const { battle, bull } = fixture();
    battle.frames[2].events = [{ ...battle.frames[1].events[0], skill: false }];
    expect(bullTransformation(battle, bull, 2)).toBeNull();
    expect(bullTransformation(battle, { ...bull, hp: 0 }, 1.5)).toBeNull();
    battle.frames[1].effects = [];
    expect(bullTransformation(battle, bull, 1.5)).toBeNull();
  });
  it("回放倒退再定位得到相同形态和坐标", () => {
    const { battle, bull } = fixture();
    const first = bullTransformation(battle, bull, 2.25);
    bullTransformation(battle, bull, 4.5);
    bullTransformation(battle, bull, 0);
    expect(bullTransformation(battle, bull, 2.25)).toEqual(first);
  });
  it("召唤当步被击杀也能正确淡出，缺少出生前快照不报错", () => {
    const fighters = [
      ...army([{ uid: 1, defId: "wolf", star: 1, position: 35 }], 0),
      ...army([{ uid: 2, defId: "cannon", star: 3, position: 35 }], 1),
    ];
    const [wolf, enemy] = fighters;
    wolf.mana = 100;
    const before = structuredClone(fighters);
    const ctx: CombatContext = { tick: 1, fighters, events: [], effects: [] };
    castSkill(ctx, wolf, enemy);
    const pup = fighters.find((f) => f.summon)!;
    damage(ctx, enemy, pup, 99999, "true");
    const battle: Battle = {
      frames: [
        { tick: 0, fighters: before, events: [], effects: [] },
        structuredClone(ctx),
      ],
      winner: null,
      damage: 3,
    };
    for (let tick = 2; tick <= 8; tick++)
      battle.frames.push({
        tick,
        fighters: structuredClone(fighters),
        events: [],
        effects: [],
      });
    expect(deathFade(battle, pup.uid, 1, 1)).toBe(0);
    expect(deathFade(battle, pup.uid, 1, 1.5)).toBeCloseTo(0.2);
    expect(deathFade(battle, pup.uid, 2, 2.25)).toBeCloseTo(0.5);
    expect(deathFade(battle, pup.uid, 4, 4)).toBe(1);
    expect(deathFade(battle, pup.uid, 8, 8)).toBe(1);
    expect(deathFade(battle, wolf.uid, 2, 2.25)).toBe(0);
    expect(deathFade(battle, -999, 1, 1)).toBe(0);
  });
});
