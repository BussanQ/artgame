import { describe, expect, it } from "vitest";
import { ITEMS, equipmentStats } from "../src/data/items";
import { encounterFor, encounterArmy } from "../src/data/encounters";
import {
  createGame,
  buy,
  move,
  merge,
  sell,
  startRound,
  settle,
  nextRound,
  resumeRound,
} from "../src/engine/game";
import {
  equip,
  unequip,
  craft,
  canCraft,
  claimReward,
  equipBot,
} from "../src/engine/equipment";
import { army } from "../src/engine/battle";
import { damage, castSkill } from "../src/engine/abilities";
import {
  SaveStore,
  decodeSave,
  validGame,
  SAVE_SCHEMA,
} from "../src/engine/persistence";

function setup() {
  const g = createGame(123),
    p = g.players[0];
  buy(g, p, 0);
  move(g, p, p.pieces[0].uid, 35);
  return { g, p, piece: p.pieces[0] };
}
describe("野怪回合与装备构筑", () => {
  it("野怪不占用共享卡池，胜败均提供唯一奖励选项且不改变连续胜负", () => {
    const { g, p } = setup();
    p.streak = 1;
    const r = startRound(g)!;
    expect(r.kind).toBe("pve");
    expect(r.opponent.id).toBe(-1);
    expect(r.right).toEqual(encounterArmy(encounterFor(g)!));
    settle(g, r);
    expect(p.streak).toBe(1);
    expect(g.reward!.choices.length).toBe(r.battle.winner === 0 ? 3 : 2);
    expect(new Set(g.reward!.choices).size).toBe(g.reward!.choices.length);
    expect(validGame(g)).toBe(true);
    expect(
      g.players
        .slice(1)
        .filter((x) => x.hp > 0)
        .every((x) => x.inventory.length === 1),
    ).toBe(true);
  });
  it("待选奖励阻止下一回合，领取一次后才能推进，不能重复领奖", () => {
    const { g, p } = setup();
    settle(g, startRound(g)!);
    const chosen = g.reward!.choices[0];
    nextRound(g);
    expect(g.round).toBe(1);
    expect(claimReward(g, 99)).toBe(false);
    expect(claimReward(g, 0)).toBe(true);
    expect(p.inventory).toEqual([chosen]);
    expect(g.history[0].reward).toBe(chosen);
    expect(claimReward(g, 0)).toBe(false);
    nextRound(g);
    expect(g.round).toBe(2);
  });
  it("待选奖励和穿戴装备可存档，恢复不会重新抽取奖品或消费随机数", () => {
    const { g, p, piece } = setup();
    settle(g, startRound(g)!);
    const choices = [...g.reward!.choices],
      seed = g.seed;
    const data = new Map<string, string>(),
      storage = {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => {
          data.set(k, v);
        },
      };
    const saves = new SaveStore(storage);
    saves.load();
    expect(saves.save(g, { time: 0, speed: 1, paused: false })).toBe("saved");
    const loaded = new SaveStore(storage).load().data!.game;
    expect(loaded.reward!.choices).toEqual(choices);
    expect(loaded.seed).toBe(seed);
    claimReward(loaded, 0);
    nextRound(loaded);
    expect(equip(loaded, loaded.players[0], 0, piece.uid)).toBe(true);
    expect(saves.save(loaded, { time: 0, speed: 1, paused: false })).toBe(
      "saved",
    );
    expect(
      new SaveStore(storage).load().data!.game.players[0].pieces[0].items,
    ).toEqual([choices[0]]);
    expect(p.inventory).toHaveLength(0);
  });
  it("装备/卸下只在准备阶段，最多三件，非法索引不改变库存", () => {
    const { g, p, piece } = setup();
    p.inventory = ["blade", "core", "plate", "fang"];
    for (let i = 0; i < 3; i++) expect(equip(g, p, 0, piece.uid)).toBe(true);
    expect(equip(g, p, 0, piece.uid)).toBe(false);
    expect(p.inventory).toEqual(["fang"]);
    expect(unequip(g, p, piece.uid, -1)).toBe(false);
    expect(unequip(g, p, piece.uid, 1)).toBe(true);
    expect(p.inventory).toEqual(["fang", "core"]);
    g.phase = "battle";
    const before = structuredClone(p);
    expect(equip(g, p, 0, piece.uid)).toBe(false);
    expect(unequip(g, p, piece.uid, 0)).toBe(false);
    expect(p).toEqual(before);
  });
  it("所有配方精确消耗两份库存材料，同种材料不足不能合成", () => {
    for (const item of ITEMS.filter((x) => x.recipe)) {
      const { g, p } = setup();
      p.inventory = [...item.recipe!];
      expect(canCraft(p, item.id)).toBe(true);
      expect(craft(g, p, item.id)).toBe(true);
      expect(p.inventory).toEqual([item.id]);
      expect(craft(g, p, item.id)).toBe(false);
    }
    const { g, p } = setup();
    p.inventory = ["blade"];
    expect(craft(g, p, "warblade")).toBe(false);
    expect(p.inventory).toEqual(["blade"]);
  });
  it("升星保留三件装备，溢出归库存；出售归还全部装备", () => {
    const { g, p } = setup();
    p.pieces = [
      {
        uid: 101,
        defId: "guard",
        star: 1,
        position: 35,
        items: ["blade", "plate"],
      },
      {
        uid: 102,
        defId: "guard",
        star: 1,
        position: null,
        items: ["core", "fang"],
      },
      { uid: 103, defId: "guard", star: 1, position: null, items: ["coil"] },
    ];
    merge(p);
    expect(p.pieces).toHaveLength(1);
    expect(p.pieces[0].star).toBe(2);
    expect(p.pieces[0].items).toEqual(["blade", "plate", "core"]);
    expect(p.inventory).toEqual(["fang", "coil"]);
    sell(g, p, 101);
    expect(p.inventory.sort()).toEqual(
      ["blade", "plate", "core", "fang", "coil"].sort(),
    );
  });
  it("装备改变实际战斗属性、法术减伤、技能伤害和普攻吸血", () => {
    const a = army(
        [
          {
            uid: 1,
            defId: "infantry",
            star: 1,
            position: 35,
            items: ["bloodblade", "staff", "core"],
          },
        ],
        0,
      )[0],
      b = army(
        [
          {
            uid: 2,
            defId: "guard",
            star: 1,
            position: 35,
            items: ["fortress"],
          },
        ],
        1,
      )[0];
    expect(a.attack).toBe(88);
    expect(a.hp).toBe(630);
    expect(a.mana).toBe(40);
    expect(a.skillPower).toBe(1.3);
    expect(b.armor).toBe(16);
    expect(b.magicResist).toBeCloseTo(0.3);
    a.hp = 200;
    const ctx = {
      fighters: [a, b],
      tick: 1,
      events: [],
      effects: [],
    } as Parameters<typeof damage>[0];
    expect(damage(ctx, a, b, 100, "magic")).toBe(70);
    expect(a.hp).toBe(213);
    a.mana = 100;
    castSkill(ctx, a, b);
    expect(ctx.events.at(-1)!.amount).toBe(
      Math.round((88 * 2 * 1.3 * 100) / (100 + 12 * 6)),
    );
    expect(equipmentStats(["overdrive", "overdrive", "overdrive"]).haste).toBe(
      0.55,
    );
  });
  it("AI 将装备分配给上场棋子并合成，不能给同一个棋子超过三件", () => {
    const { g, p, piece } = setup();
    p.inventory = [
      "blade",
      "blade",
      "core",
      "plate",
      "fang",
      "coil",
      "crystal",
    ];
    equipBot(g, p);
    expect(piece.items!.length).toBe(3);
    expect(
      piece.items!.includes("warblade") || p.inventory.includes("warblade"),
    ).toBe(true);
    const before = [...piece.items!, ...p.inventory].sort();
    equipBot(g, p);
    expect([...piece.items!, ...p.inventory].sort()).toEqual(before);
  });
  it("升级旧存档保留正在进行的 PvP 战斗，后续轮次才接入野怪", () => {
    const { g } = setup();
    g.encountersFromRound = 31;
    g.combatVersion = "legacy";
    const r = startRound(g)!;
    const old = JSON.parse(JSON.stringify(g));
    delete old.encountersFromRound;
    delete old.reward;
    for (const p of old.players) delete p.inventory;
    const decoded = decodeSave(
      JSON.stringify({
        schema: 1,
        rules: "singleplayer-0.2",
        savedAt: 1,
        revision: 1,
        game: old,
        playback: { time: 1, speed: 1, paused: true },
      }),
    );
    expect(decoded.status).toBe("migrated");
    expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
    expect(decoded.data!.game.encountersFromRound).toBe(2);
    const resumed = resumeRound(decoded.data!.game)!;
    expect(resumed.kind).toBe("pvp");
    expect(resumed.battle).toEqual(r.battle);
    settle(decoded.data!.game, resumed);
    nextRound(decoded.data!.game);
    expect(encounterFor(decoded.data!.game)?.round).toBe(2);
  });
  it("拒绝损坏装备、野怪属性混入玩家阵容、以及非野怪待领奖状态", () => {
    const { g, p, piece } = setup();
    expect(validGame(g)).toBe(true);
    p.inventory = ["unknown"];
    expect(validGame(g)).toBe(false);
    p.inventory = [];
    piece.encounterPower = 2;
    expect(validGame(g)).toBe(false);
    delete piece.encounterPower;
    g.reward = { round: 1, choices: ["blade", "core"] };
    expect(validGame(g)).toBe(false);
  });
});
