import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/data/items";
import { createGame, merge, move, sell } from "../src/engine/game";
import { craft, equip, unequip } from "../src/engine/equipment";
import {
  equipmentMarkup,
  equipmentOverview,
  equipmentOverviewMarkup,
  equipmentView,
} from "../src/ui/equipment";
import { pieceInfoMarkup } from "../src/ui/bench-tooltip";

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

function finished() {
  const { game, player } = setup();
  // Presentation fixture: the final record survives, live ownership is gone.
  game.phase = "finished";
  game.history = [{
    round: 1, combatVersion: game.combatVersion, opponentId: -1,
    opponentName: "守军", kind: "pve", winner: 1, hp: 0, gold: 10,
    damage: 100, income: 0,
    left: structuredClone(player.pieces.filter((p) => p.position !== null)),
    right: [],
    bench: structuredClone(player.pieces.filter((p) => p.position === null)),
    inventory: [...player.inventory],
  }];
  player.hp = 0;
  player.pieces = [];
  player.inventory = [];
  return { game, player, last: game.history[0] };
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

  it("淘汰终局仍展示出战、备战和重复装备，不恢复当前所有权或卡池", () => {
    const { game, player } = finished(), before = structuredClone(game);
    const view = equipmentView(game);
    expect(view).toMatchObject({isFinal: true, inventoryKnown: true, reservesKnown: true});
    expect(equipmentOverview(view.player).reduce((sum, entry) => sum + entry.total, 0)).toBe(7);
    const html = equipmentOverviewMarkup(game, true);
    expect(html).toContain("终局持有 7 件 · 背包 3 件 · 装备中 4 件");
    expect(html).toContain("查看盾兵1星备战席 2的装备");
    expect(html).toContain('data-equipment-owner="101"');
    expect(html).toContain('data-equipment-owner="102"');
    expect(html).toContain('data-equipment-owner="104"');
    expect(html).toContain("点击持有人查看最后的星级、装备与阵位");
    const workshop = equipmentMarkup(game, 101, false);
    expect(workshop).toContain("3 背包 · 4 已装");
    expect(workshop).toContain("合成配方 · 10 种</summary>");
    expect(workshop).not.toContain("种可合成");
    expect(workshop).not.toContain("data-unequip=");
    expect(workshop).not.toContain("挑战野怪获取装备");
    for (const button of workshop.match(/<button[^>]+data-(?:equip|craft)="[^>]+>/g) ?? [])
      expect(button).toMatch(/\bdisabled\b/);
    expect(player.pieces).toEqual([]);
    expect(player.inventory).toEqual([]);
    expect(equip(game, view.player, 2, 101)).toBe(false);
    expect(unequip(game, view.player, 101, 0)).toBe(false);
    expect(craft(game, view.player, "warblade")).toBe(false);
    expect(game).toEqual(before);
  });

  it("旧淘汰终局明确标记未知背包和备战，不把未记录误报为零件或未持有", () => {
    const { game, last } = finished();
    delete last.inventory;
    let html = equipmentOverviewMarkup(game, true);
    expect(html).toContain("已记录 4 件 · 背包 未记录 · 装备中 4 件");
    expect(html).toContain("本局未保留终局背包");
    expect(html).not.toContain("背包 0 件");
    expect(equipmentOverviewMarkup(game)).toContain("暂无持有记录");
    delete last.bench;
    html = equipmentOverviewMarkup(game, true);
    expect(html).toContain("已记录 2 件 · 背包 未记录 · 已记录穿戴 2 件");
    expect(html).toContain("本局未保留终局备战席");
    expect(html).not.toContain('data-equipment-owner="102"');
    expect(equipmentMarkup(game, null, false)).toContain("背包未记录 · 2 已记录穿戴");
  });

  it("旧存活终局从最后的实时背包和备战恢复；明确记录的空快照优先", () => {
    const { game, player, last } = finished();
    player.hp = 40;
    player.pieces = last.bench!;
    player.inventory = ["core"];
    delete last.bench;
    delete last.inventory;
    expect(equipmentOverviewMarkup(game, true)).toContain("终局持有 5 件 · 背包 1 件 · 装备中 4 件");
    last.bench = [];
    last.inventory = [];
    expect(equipmentOverviewMarkup(game, true)).toContain("终局持有 2 件 · 背包 0 件 · 装备中 2 件");
  });

  it("终局持有人详情使用该战报的版本与形象，保持只读", () => {
    const { game, last } = finished();
    last.combatVersion = "gospel";
    last.left[0].defId = "stormcaller";
    const view = equipmentView(game);
    expect(view.version).toBe("gospel");
    expect(equipmentOverviewMarkup(game, true)).toContain('/assets/units/stormcaller.png');
    expect(equipmentOverviewMarkup(game, true)).not.toContain('stormcaller-thunderstorm.png');
    const detail = pieceInfoMarkup(view.player.pieces[0], view.version, view.version, true);
    expect(detail).toContain('aria-label="终局棋子详情"');
    expect(detail).toContain('终局回顾 · 场上 C5');
    expect(detail).toContain('stormcaller.png');
    expect(detail).not.toMatch(/data-(?:equip|unequip|sell|craft)=/);
  });
});
