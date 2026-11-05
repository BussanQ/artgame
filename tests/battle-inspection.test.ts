import { describe, expect, it } from "vitest";
import { army, simulate } from "../src/engine/battle";
import {
  compactBattleLabels,
  fighterBattleMarkup,
  pickBattleFighter,
} from "../src/render/battle-inspection";
import { drawStatuses } from "../src/render/skill-effects";
import { project } from "../src/render/projection";
import { COUNTERPLAY_DEMO } from "../src/data/counterplay-demo";
import { synergies } from "../src/engine/synergies";

const unit = () =>
  army([{ uid: 1, defId: "guard", star: 2, position: 35 }], 0)[0];
describe("战斗详情与短状态", () => {
  it("永久收益移到详情，优先显示至多两个短控制提示，过期立即消失", () => {
    const f = unit();
    Object.assign(f, {
      formationHaste: 0.75,
      formationAttack: 0.45,
      armorPenetration: 12,
      reflection: 50,
    });
    expect(compactBattleLabels(f, 1)).toEqual([]);
    f.stunUntil = 5;
    f.knockup = { start: 1, until: 5 };
    f.silenceUntil = 6;
    expect(compactBattleLabels(f, 1)).toEqual(["击飞", "沉默"]);
    expect(compactBattleLabels(f, 5)).toEqual(["沉默"]);
    expect(compactBattleLabels(f, 6)).toEqual([]);
  });
  it("精简文字保留完整状态和原有图形效果，详情不伪造未来统计", () => {
    const f = unit();
    f.formationHaste = 0.75;
    f.teamHaste = 0.6;
    f.armorPenetration = 12;
    f.reflection = 50;
    f.shield = 200;
    const texts: string[] = [],
      shapes: string[] = [],
      properties: Record<PropertyKey, unknown> = {};
    let labels: string[] = [];
    const canvas = new Proxy(properties, {
      get: (target, key) =>
        key === "fillText"
          ? (s: string) => texts.push(s)
          : (target[key] ?? (() => shapes.push(String(key)))),
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    drawStatuses(canvas, f, 1, 1, true, {
      compact: true,
      onLabels: (value) => {
        labels = value;
      },
    });
    expect(texts).toEqual([]);
    expect(shapes).toContain("ellipse");
    expect(labels).toEqual(
      expect.arrayContaining(["狙击甲穿 +12", "灵能反伤 50", "野兽攻速 +75%"]),
    );
    const markup = fighterBattleMarkup(f, 1, labels);
    expect(markup).toContain("狙击甲穿 +12");
    expect(markup).toContain(`${f.hp} / ${f.maxHp}`);
    expect(markup).not.toContain("总伤害");
    expect(markup).toContain("点击棋子固定详情");
  });
  it("命中身体而非仅脚下格子，重叠选择前景单位，排除死者且不修改输入", () => {
    const a = unit(),
      b = { ...unit(), uid: 2 };
    const p = project(a.x + 0.5, a.y + 0.65);
    const before = structuredClone([a, b]);
    expect(pickBattleFighter([a, b], { x: p.x, y: p.y - 60 })).toBe(2);
    b.hp = 0;
    expect(pickBattleFighter([a, b], { x: p.x, y: p.y - 60 })).toBe(1);
    expect(pickBattleFighter([a, b], { x: 0, y: 0 })).toBeNull();
    expect(a).toEqual(before[0]);
  });
  it("狙骑反制使用八枚合法棋子，真实形成六狙两骑，对手四海四灵能", () => {
    const { left, right } = COUNTERPLAY_DEMO;
    for (const team of [left, right]) {
      expect(team).toHaveLength(8);
      expect(new Set(team.map((f) => f.position)).size).toBe(8);
      expect(
        team.every(
          (f) => f.star >= 1 && f.star <= 3 && (f.items?.length ?? 0) <= 3,
        ),
      ).toBe(true);
    }
    expect(synergies(left).find((s) => s.trait === "狙击")).toMatchObject({
      count: 6,
      tier: 2,
    });
    expect(synergies(left).find((s) => s.trait === "骑兵")).toMatchObject({
      count: 2,
      tier: 1,
    });
    expect(synergies(right).find((s) => s.trait === "海神")).toMatchObject({
      count: 4,
      tier: 2,
    });
    const b = simulate(left, right);
    expect(
      b.frames[0].fighters
        .filter((f) => f.side === 1)
        .every((f) => f.energyPenalty === 3 && f.reflection === 50),
    ).toBe(true);
  });
});
