import { describe, it, expect } from "vitest";
import { project, cellAt } from "../src/render/projection";
import { simulate } from "../src/engine/battle";
describe("战场投影与表现事件", () => {
  it("64 个棋格中心均能从投影位置还原，场外不产生落点", () => {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const p = project(x + 0.5, y + 0.5);
        expect(cellAt(p.x, p.y)).toBe(y * 8 + x);
      }
    expect(cellAt(0, 0)).toBeNull();
    expect(cellAt(1280, 790)).toBeNull();
  });
  it("攻击事件有真实目标、实际伤害与合法坐标，累计伤害匹配结果", () => {
    const b = simulate(
      [{ uid: 1, defId: "infantry", star: 2, position: 35 }],
      [{ uid: 2, defId: "guard", star: 2, position: 35 }],
    );
    const sums = new Map<number, number>();
    let count = 0;
    for (const frame of b.frames)
      for (const e of frame.events) {
        count++;
        expect(e.attacker).not.toBe(e.target);
        expect(e.amount).toBeGreaterThanOrEqual(0);
        expect(e.amount + e.absorbed).toBeGreaterThan(0);
        for (const p of [e.from, e.to]) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThan(8);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThan(8);
        }
        sums.set(e.attacker, (sums.get(e.attacker) ?? 0) + e.amount);
      }
    expect(count).toBeGreaterThan(0);
    for (const f of b.frames.at(-1)!.fighters)
      expect(sums.get(f.uid) ?? 0).toBe(f.damage);
  });
});

import { MELEE_ACTIONS, meleePose, REST_POSE } from "../src/render/melee";
import { UNITS } from "../src/data/units";
import { pieceDetails } from "../src/ui/bench-tooltip";
import {
  RANGED_ACTIONS,
  rangedActionName,
  rangedPose,
  projectilePoint,
} from "../src/render/ranged";
describe("远程攻击表现", () => {
  it("覆盖所有远程单位，动作不同且普通攻击和技能均回到待机", () => {
    const ranged = UNITS.filter((u) => u.range > 1);
    expect(ranged.map((u) => u.id).sort()).toEqual(
      Object.keys(RANGED_ACTIONS).sort(),
    );
    const trajectories = new Set<string>();
    for (const u of ranged) {
      const id = u.id as keyof typeof RANGED_ACTIONS;
      for (const skill of [false, true]) {
        expect(rangedPose(id, 0, skill)).toEqual(REST_POSE);
        expect(rangedPose(id, 1, skill)).toEqual(REST_POSE);
        const poses = Array.from({ length: 41 }, (_, i) =>
          rangedPose(id, i / 40, skill),
        );
        for (const pose of poses) {
          expect(Object.values(pose).every(Number.isFinite)).toBe(true);
          expect(pose.scaleX).toBeGreaterThan(0);
          expect(pose.scaleY).toBeGreaterThan(0);
        }
        if (!skill) trajectories.add(JSON.stringify(poses));
      }
      expect(
        pieceDetails({ uid: 1, defId: id, star: 1, position: null }).action,
      ).toBe(rangedActionName(id));
    }
    expect(trajectories.size).toBe(ranged.length);
  });
  it("直射与抛射均到达目标，抛射中点高于直射且进度限制在弹道内", () => {
    const from = { x: 10, y: 100 },
      to = { x: 210, y: 200 };
    expect(projectilePoint(from, to, -1, 90)).toEqual(from);
    const end = projectilePoint(from, to, 2, 90);
    expect(end.x).toBe(to.x);
    expect(end.y).toBeCloseTo(to.y);
    expect(projectilePoint(from, to, 0.5)).toEqual({ x: 110, y: 150 });
    expect(projectilePoint(from, to, 0.5, 90)).toEqual({ x: 110, y: 60 });
  });
});
describe("近战动作与棋子信息", () => {
  it("每个近战兵种都有独立动作，整段轨迹合法并回到待机姿态", () => {
    const melee = UNITS.filter((u) => u.range === 1);
    expect(melee.map((u) => u.id).sort()).toEqual(
      Object.keys(MELEE_ACTIONS).sort(),
    );
    const signatures = new Set<string>();
    for (const u of melee) {
      const id = u.id as keyof typeof MELEE_ACTIONS;
      expect(meleePose(id, 0)).toEqual(REST_POSE);
      expect(meleePose(id, 1)).toEqual(REST_POSE);
      const trajectory = Array.from({ length: 21 }, (_, i) =>
        meleePose(id, i / 20),
      );
      for (const p of trajectory) {
        for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
        expect(p.scaleX).toBeGreaterThan(0);
        expect(p.scaleY).toBeGreaterThan(0);
        expect(p.alpha).toBeGreaterThanOrEqual(0);
        expect(p.alpha).toBeLessThanOrEqual(1);
      }
      signatures.add(JSON.stringify(trajectory));
    }
    expect(signatures.size).toBe(melee.length);
  });
  it("备战信息按当前星级成长，间隔按逻辑秒换算，不混入场上羁绊", () => {
    const d = pieceDetails({ uid: 1, defId: "guard", star: 3, position: null });
    expect(d.hp).toBe(3200);
    expect(d.attack).toBe(144);
    expect(d.armor).toBe(7);
    expect(d.interval).toBe(1);
    expect(d.sell).toBe(9);
    expect(d.action).toBe("蓄势盾击");
    expect(d.traits.map((t) => t.name)).toEqual(["步兵", "护卫"]);
  });
});
