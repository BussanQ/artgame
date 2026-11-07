import { describe, expect, it } from "vitest";
import { rotationMarkup } from "../src/ui/rotation";
import type { RecruitmentContext } from "../src/engine/rotation";

function odds(context: RecruitmentContext) {
  return Object.fromEntries(
    [
      ...rotationMarkup(context).matchAll(
        /<tr><td>(\d) 金<\/td><td>(\d+) → (\d+)<\/td><td>([\d.]+)% → ([\d.]+)%<\/td><\/tr>/g,
      ),
    ].map(([, cost, total, available, before, after]) => [
      cost,
      { total: +total, available: +available, before: +before, after: +after },
    ]),
  );
}

describe("禁用面板使用整局固定的价格目录", () => {
  for (const versions of [
    { combatVersion: "qi" as const },
    { combatVersion: "taotie" as const, catalogVersion: "qi" as const },
  ]) {
    it(`${JSON.stringify(versions)}禁用蛤蟆时，旧四费候选总数多一、新五费少一`, () => {
      const old: RecruitmentContext = {
        ...versions,
        bannedSeries: ["猛禽", "步兵", "熊猫"],
      };
      const current: RecruitmentContext = {
        ...old,
        combatVersion: "taotie",
        catalogVersion: "taotie",
      };
      const before = structuredClone(old),
        a = odds(old),
        b = odds(current);
      expect(a[4].total).toBe(b[4].total + 1);
      expect(a[5].total).toBe(b[5].total - 1);
      expect(a[4].available).toBe(b[4].available);
      expect(a[5].available).toBe(b[5].available);
      expect(a[4].before).toBeLessThan(b[4].before);
      expect(rotationMarkup(old)).toContain(
        "飞天蛤蟆<small>4 金 · 猛禽 / 异能",
      );
      expect(rotationMarkup(current)).toContain(
        "飞天蛤蟆<small>5 金 · 猛禽 / 异能",
      );
      expect(old).toEqual(before);
    });
  }

  it("蛤蟆未禁用时，同费用的剩余候选与初始概率也跟随旧目录", () => {
    const old: RecruitmentContext = {
      combatVersion: "taotie",
      catalogVersion: "qi",
      bannedSeries: ["装甲", "步兵", "熊猫"],
    };
    const current: RecruitmentContext = { ...old, catalogVersion: "taotie" };
    const a = odds(old),
      b = odds(current);
    expect(a[4].total).toBe(b[4].total + 1);
    expect(a[5].total).toBe(b[5].total - 1);
    expect(a[4].available).toBe(b[4].available + 1);
    expect(a[5].available).toBe(b[5].available - 1);
    expect(a[4].after).toBeLessThan(b[4].after);
    expect(a[5].after).toBeGreaterThan(b[5].after);
    for (const row of Object.values(a)) {
      expect(row.before).toBe(+(100 / row.total).toFixed(1));
      expect(row.after).toBe(+(100 / row.available).toFixed(1));
    }
  });
});
