import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/data/items";
import { createGame, merge, move, sell } from "../src/engine/game";
import { craft, equip, unequip } from "../src/engine/equipment";
import {
  equipmentMarkup,
  equipmentOverview,
  equipmentOverviewMarkup,
} from "../src/ui/equipment";

function setup() {
  const game = createGame(123, "classic");
  const player = game.players[0];
  player.pieces = [
    {
      uid: 101,
      defId: "guard",
      star: 2,
      position: 34,
      items: ["blade", "blade"],
    },
    { uid: 102, defId: "guard", star: 1, position: null, items: ["fortress"] },
    { uid: 103, defId: "infantry", star: 1, position: 35 },
    { uid: 104, defId: "guard", star: 1, position: null, items: ["blade"] },
  ];
  player.inventory = ["blade", "blade", "core"];
  return { game, player };
}

describe("装备工坊总览", () => {
  it("按实物计数，包含备战席、同名棋子和同一棋子的重复装备", () => {
    const { game, player } = setup();
    game.players[1].inventory = ["blade"];
    game.players[1].pieces = [
      { uid: 201, defId: "guard", star: 3, position: 35, items: ["blade"] },
    ];
    const before = structuredClone(game);
    const entries = equipmentOverview(player);
    expect(entries).toHaveLength(ITEMS.length);
    expect(entries.find((entry) => entry.item.id === "blade")).toMatchObject({
      inventoryCount: 2,
      equippedCount: 3,
      total: 5,
      owners: [
        { piece: { uid: 101, star: 2 }, copies: 2, location: "场上 C5" },
        { piece: { uid: 104, star: 1 }, copies: 1, location: "备战席 2" },
      ],
    });
    expect(entries.find((entry) => entry.item.id === "fortress")).toMatchObject(
      {
        inventoryCount: 0,
        equippedCount: 1,
        total: 1,
        owners: [{ piece: { uid: 102 }, location: "备战席 1" }],
      },
    );
    expect(entries.reduce((count, entry) => count + entry.total, 0)).toBe(7);
    equipmentOverviewMarkup(game);
    equipmentMarkup(game, 101, false);
    expect(game).toEqual(before);
  });

  it("穿戴、卸下、调位和合成后显示当前归属，不保留旧持有人", () => {
    const { game, player } = setup();
    const blade = () =>
      equipmentOverview(player).find((entry) => entry.item.id === "blade")!;
    expect(equip(game, player, 0, 103)).toBe(true);
    expect(blade()).toMatchObject({
      inventoryCount: 1,
      equippedCount: 4,
      total: 5,
    });
    expect(move(game, player, 104, 36)).toBe(true);
    expect(
      blade().owners.find((owner) => owner.piece.uid === 104)?.location,
    ).toBe("场上 E5");
    expect(unequip(game, player, 103, 0)).toBe(true);
    expect(blade().owners.some((owner) => owner.piece.uid === 103)).toBe(false);
    expect(craft(game, player, "warblade")).toBe(true);
    expect(blade()).toMatchObject({
      inventoryCount: 0,
      equippedCount: 3,
      total: 3,
    });
    expect(
      equipmentOverview(player).find((entry) => entry.item.id === "warblade"),
    ).toMatchObject({
      inventoryCount: 1,
      equippedCount: 0,
      total: 1,
      owners: [],
    });
  });

  it("升星溢出和出售归还后守恒，已消失棋子不再被列为持有人", () => {
    const { game, player } = setup();
    player.inventory = [];
    player.pieces = [
      {
        uid: 101,
        defId: "guard",
        star: 1,
        position: 35,
        items: ["blade", "blade"],
      },
      {
        uid: 102,
        defId: "guard",
        star: 1,
        position: null,
        items: ["blade", "core"],
      },
      {
        uid: 103,
        defId: "guard",
        star: 1,
        position: null,
        items: ["fortress"],
      },
    ];
    merge(player);
    const merged = equipmentOverview(player);
    expect(merged.reduce((sum, entry) => sum + entry.total, 0)).toBe(5);
    expect(
      merged
        .flatMap((entry) => entry.owners)
        .every((owner) => owner.piece.uid === 101 && owner.piece.star === 2),
    ).toBe(true);
    expect(sell(game, player, 101)).toBe(true);
    const sold = equipmentOverview(player);
    expect(sold.every((entry) => entry.owners.length === 0)).toBe(true);
    expect(sold.reduce((sum, entry) => sum + entry.inventoryCount, 0)).toBe(5);
    expect(
      sold.find((entry) => entry.item.id === "blade")?.inventoryCount,
    ).toBe(3);
  });

  it("无装备时仍可查看全部属性和配方，已持有筛选有空态", () => {
    const { game, player } = setup();
    player.inventory = [];
    player.pieces = [];
    const all = equipmentOverviewMarkup(game);
    expect(all.match(/data-equipment-item=/g)).toHaveLength(ITEMS.length);
    for (const item of ITEMS) {
      expect(all).toContain(item.name);
      expect(all).toContain(item.description);
    }
    expect(all).toContain("配方：合金刃 + 合金刃");
    expect(all).toContain("持有 0 件 · 背包 0 件 · 装备中 0 件");
    const held = equipmentOverviewMarkup(game, true);
    expect(held).not.toContain("data-equipment-item=");
    expect(held).toContain("尚未持有装备");
  });

  it("筛选后保留装备中的物品，工坊与总览都可按棋子身份定位", () => {
    const { game } = setup();
    const held = equipmentOverviewMarkup(game, true);
    expect(held.match(/data-equipment-item=/g)).toHaveLength(3);
    expect(held).toContain('data-equipment-item="fortress"');
    expect(held).toContain('data-equipment-owner="102"');
    expect(held).toContain("查看盾兵1星备战席 1的装备");
    expect(held).not.toContain('data-equipment-item="warblade"');
    const workshop = equipmentMarkup(game, 101, false);
    expect(workshop).toContain("3 背包 · 4 已装");
    expect(workshop).toContain("盾兵 ★★ · 场上 C5");
    expect(workshop).toContain("盾兵 ★ · 备战席 2");
    expect(workshop).toContain("合金刃 ×2");
    expect(workshop).toContain('data-equipment-owner="104"');
  });
});
