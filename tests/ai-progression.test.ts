import { describe, expect, it } from "vitest";
import { prepareBot } from "../src/engine/ai";
import { buy, buyXp, createGame, roll, sell } from "../src/engine/game";
import { validGame } from "../src/engine/persistence";
import { pieceCopies } from "../src/engine/progression";
import { catalogCost } from "../src/data/catalog";
import { COPIES, UNITS } from "../src/data/units";
import type { Piece, RoundReport } from "../src/engine/types";

function fixture(round = 25, level = 10) {
  const g = createGame(137, "classic"),
    p = g.players[1];
  g.round = round;
  g.history = Array.from(
    { length: round - 1 },
    (_, i): RoundReport => ({
      round: i + 1,
      combatVersion: g.combatVersion,
      opponentId: 2,
      opponentName: g.players[2].name,
      kind: "pvp",
      winner: 0,
      damage: 0,
      income: 5,
      hp: 100,
      gold: 10,
      left: [{ uid: 100000, defId: "guard", star: 1, position: 35 }],
      right: [],
    }),
  );
  p.aiProfile = "psychic";
  p.level = level;
  p.gold = 1;
  for (const player of g.players) {
    for (const id of player.shop) if (id) g.pool[id]++;
    player.shop = [null, null, null, null, null];
  }
  const give = (
    defId: string,
    star = 1,
    position: number | null = null,
    copies?: number,
  ) => {
    const piece: Piece = {
      uid: g.nextUid++,
      defId,
      star,
      position,
      ...(copies === undefined ? {} : { copies }),
    };
    g.pool[defId] -= pieceCopies(piece);
    p.pieces.push(piece);
    return piece;
  };
  const offer = (id: string) => {
    p.shop[0] = id;
    g.pool[id]--;
  };
  const trace = { rolls: 0, xp: 0, sales: [] as number[] };
  const actions = {
    buy,
    sell(game: typeof g, player: typeof p, uid: number) {
      const ok = sell(game, player, uid);
      if (ok) trace.sales.push(uid);
      return ok;
    },
    roll(game: typeof g, player: typeof p) {
      trace.rolls++;
      return roll(game, player);
    },
    buyXp(game: typeof g, player: typeof p) {
      const ok = buyXp(game, player);
      if (ok) trace.xp++;
      return ok;
    },
  };
  return { g, p, give, offer, trace, actions };
}

// Real seed-137 round-25 roster, with gear removed to isolate the copy decision.
function latePsychic(f: ReturnType<typeof fixture>) {
  for (const [id, star, position] of [
    ["adept", 2, 63],
    ["acolyte", 2, 57],
    ["deer", 2, 43],
    ["wolf", 2, 36],
    ["winddragon", 2, 56],
    ["shark", 1, 34],
    ["stormcaller", 2, 59],
    ["master", 2, 35],
    ["shadowblade", 1, 32],
    ["thunderlord", 1, 61],
    ["panda", 2, null],
    ["acolyte", 2, null],
    ["adept", 2, null],
    ["treant", 1, null],
    ["wolf", 1, null],
    ["bonedragon", 1, null],
    ["shark", 1, null],
    ["bonedragon", 1, null],
  ] as const)
    f.give(id, star, position);
  expect(validGame(f.g)).toBe(true);
}

function nearThreeStar(f: ReturnType<typeof fixture>) {
  f.p.aiProfile = "beasts";
  for (const [i, id] of [
    "elephant",
    "venombeast",
    "wolf",
    "bloodhawk",
    "cavalry",
    "treant",
    "guard",
    "acolyte",
  ].entries())
    f.give(id, 2, 32 + i);
  f.give("elephant", 2);
  f.give("elephant");
  expect(validGame(f.g)).toBe(true);
}

// Seed 137, round 28: two loose arks, a titan pair and other unfinished rares.
function lateCore(f: ReturnType<typeof fixture>, arks = 2) {
  for (const [id, star, position, items] of [
    ["adept", 2, 59, ["warblade", "staff", "staff"]],
    ["bloodhawk", 2, 36, []],
    ["wolf", 1, 37, []],
    ["turtle", 2, 35, []],
    ["stormcaller", 2, 61, []],
    ["titan", 1, 34, []],
    ["cannon", 2, 56, ["coil"]],
    ["bull", 1, 38, []],
    ["bonedragon", 2, 63, []],
    ["shark", 1, 33, []],
    ["vine", 2, null, []],
    ["wolf", 1, null, []],
    ["bloodhawk", 1, null, []],
    ["bloodhawk", 1, null, []],
    ["titan", 1, null, []],
    ["thunderlord", 1, null, []],
  ] as const)
    f.give(id, star, position).items = [...items];
  for (let i = 0; i < arks; i++) f.give("ark");
  expect(validGame(f.g)).toBe(true);
}

describe("后期追星与经营投入", () => {
  it("不盲买即使升成二星也无法改善当前阵容的陌生高费", () => {
    const f = fixture(28);
    lateCore(f, 0);
    f.p.gold = 4;
    f.offer("ark");
    prepareBot(f.g, f.p, f.actions);
    expect(f.p.pieces.some((piece) => piece.defId === "ark")).toBe(false);
    expect(f.p.gold).toBe(4);
    expect(f.trace.sales).toEqual([]);
    expect(validGame(f.g)).toBe(true);
  });

  it("已有值得继续收集的高费目标时，不为第三种投机棋子填满备战", () => {
    const f = fixture(28);
    lateCore(f, 1);
    f.p.gold = 5;
    f.offer("whale");
    const held = f.p.pieces.map((piece) => piece.uid);
    prepareBot(f.g, f.p, f.actions);
    expect(f.p.pieces.some((piece) => piece.defId === "whale")).toBe(false);
    expect(f.p.pieces.map((piece) => piece.uid)).toEqual(held);
    expect(f.p.gold).toBe(5);
    expect(validGame(f.g)).toBe(true);
  });

  it("高费目标预算不阻止满席的即时二星合成，也不提前卖掉材料", () => {
    const f = fixture(28);
    lateCore(f);
    f.p.gold = 5;
    f.offer("titan");
    prepareBot(f.g, f.p, f.actions);
    expect(f.p.pieces.filter((piece) => piece.defId === "titan")).toEqual([
      expect.objectContaining({ star: 2 }),
    ]);
    expect(f.trace.sales).toEqual([]);
    expect(f.p.gold).toBe(0);
    expect(validGame(f.g)).toBe(true);
  });

  it("即使已有收集目标，能直接改善当前阵容的一星高费仍可购买", () => {
    const f = fixture(25, 6);
    f.p.aiProfile = "fleet";
    for (const [i, id] of [
      "guard",
      "fish",
      "acolyte",
      "repair",
      "panda",
      "infantry",
    ].entries())
      f.give(id, 1, 32 + i);
    for (const id of ["ark", "ark", "thunderlord", "thunderlord"]) f.give(id);
    f.p.gold = 5;
    f.offer("titan");
    expect(validGame(f.g)).toBe(true);
    prepareBot(f.g, f.p, f.actions);
    expect(
      f.p.pieces.some(
        (piece) => piece.defId === "titan" && piece.position !== null,
      ),
    ).toBe(true);
    expect(f.p.gold).toBe(0);
    expect(validGame(f.g)).toBe(true);
  });

  it("满席接着收集已上场二星核心，完成三星需要的散件不会被陌生高费占位压过", () => {
    const f = fixture();
    latePsychic(f);
    f.p.gold = 2; // Current gospel acolyte costs two; keep the offered material affordable.
    f.offer("acolyte");
    prepareBot(f.g, f.p, f.actions);
    expect(
      f.p.pieces
        .filter((p) => p.defId === "acolyte")
        .reduce((n, p) => n + pieceCopies(p), 0),
    ).toBe(7);
    expect(f.trace.sales).toHaveLength(1);
    expect(validGame(f.g)).toBe(true);
  });

  it("健康且接近低费三星时先追星，保留八级的招募概率；危险血量仍购买经验补人口", () => {
    const healthy = fixture(18, 8);
    nearThreeStar(healthy);
    healthy.p.gold = 70;
    prepareBot(healthy.g, healthy.p, healthy.actions);
    expect(healthy.trace.xp).toBe(0);
    expect(healthy.trace.rolls).toBeGreaterThan(2);
    expect(validGame(healthy.g)).toBe(true);
    const danger = fixture(18, 8);
    nearThreeStar(danger);
    danger.p.gold = 70;
    danger.p.hp = 30;
    prepareBot(danger.g, danger.p, danger.actions);
    expect(danger.trace.xp).toBeGreaterThan(0);
    expect(validGame(danger.g)).toBe(true);
    const late = fixture(23, 8);
    nearThreeStar(late);
    late.p.gold = 70;
    prepareBot(late.g, late.p, late.actions);
    expect(late.trace.xp).toBeGreaterThan(0);
    expect(validGame(late.g)).toBe(true);
  });

  it("标准档在后期有大量可用金币时增加付费刷新，合法收集而不是每轮固定两次", () => {
    const f = fixture();
    latePsychic(f);
    f.p.gold = 100;
    const duplicate = structuredClone(f.g);
    prepareBot(f.g, f.p, f.actions);
    prepareBot(duplicate, duplicate.players[1], { buy, sell, roll, buyXp });
    expect(f.trace.rolls).toBeGreaterThan(2);
    expect(f.p.gold).toBeLessThan(80);
    expect(f.g).toEqual(duplicate);
    expect(validGame(f.g)).toBe(true);
  });

  it("休闲档仍然只少量刷新、不付费升人口，健康中期不突破储蓄线", () => {
    const easy = fixture(18, 8);
    nearThreeStar(easy);
    easy.g.difficulty = "relaxed";
    easy.p.gold = 100;
    prepareBot(easy.g, easy.p, easy.actions);
    expect(easy.trace.rolls).toBeLessThanOrEqual(1);
    expect(easy.trace.xp).toBe(0);
    expect(validGame(easy.g)).toBe(true);
    const saving = fixture(12, 10);
    latePsychic(saving);
    saving.p.gold = 25;
    prepareBot(saving.g, saving.p, saving.actions);
    expect(saving.p.gold).toBe(25);
    expect(saving.trace.rolls).toBe(0);
    expect(validGame(saving.g)).toBe(true);
  });

  it("购买第四种异虫能直接完成现有三星时识别真实合并，即使金币低于储蓄线", () => {
    const f = fixture(18, 8);
    f.p.aiProfile = "insects";
    for (const [i, id] of [
      "elephant",
      "wolf",
      "bloodhawk",
      "cavalry",
      "treant",
      "guard",
      "acolyte",
    ].entries())
      f.give(id, 2, 32 + i);
    f.give("eyebug", 2, 40, 2);
    f.give("eyebug", 2, null, 2);
    f.give("blastbug");
    f.give("spider");
    f.p.gold = 4;
    f.offer("wasp");
    expect(validGame(f.g)).toBe(true);
    prepareBot(f.g, f.p, f.actions);
    expect(f.p.pieces.find((p) => p.defId === "eyebug")).toMatchObject({
      star: 3,
      copies: 4,
    });
    expect(f.p.gold).toBe(0);
    expect(f.trace.sales).toEqual([]);
    expect(validGame(f.g)).toBe(true);
  });

  it("满席购买第九张能连续合成三星，不预先出售其他棋子", () => {
    const f = fixture(25, 8);
    nearThreeStar(f);
    f.give("elephant");
    for (const id of ["master", "panda", "bonedragon", "shark", "winddragon"])
      f.give(id);
    const kept = f.p.pieces.find((p) => p.defId === "elephant")!.uid;
    f.offer("elephant");
    expect(validGame(f.g)).toBe(true);
    prepareBot(f.g, f.p, f.actions);
    expect(f.p.pieces.filter((p) => p.defId === "elephant")).toEqual([
      expect.objectContaining({ uid: kept, star: 3 }),
    ]);
    expect(f.trace.sales).toEqual([]);
    expect(f.p.gold).toBe(0);
    expect(validGame(f.g)).toBe(true);
  });

  it("旧局仍按旧价格购买高费核心，不凭新价格跳过可负担的招募", () => {
    const f = fixture();
    f.g.catalogVersion = "qi";
    for (const unit of UNITS)
      f.g.pool[unit.id] = COPIES[catalogCost(f.g,unit.id)];
    f.p.gold = 4;
    f.offer("skytoad");
    expect(validGame(f.g)).toBe(true);
    prepareBot(f.g, f.p, f.actions);
    expect(f.p.pieces).toEqual([
      expect.objectContaining({ defId: "skytoad", star: 1 }),
    ]);
    expect(f.p.gold).toBe(0);
    expect(validGame(f.g)).toBe(true);
  });

  it("失败的刷新立即停止，不反复请求；已三星的棋子不继续购买", () => {
    const f = fixture();
    latePsychic(f);
    f.p.gold = 100;
    let attempts = 0;
    prepareBot(f.g, f.p, {
      ...f.actions,
      roll: () => {
        attempts++;
        return false;
      },
    });
    expect(attempts).toBe(1);
    expect(validGame(f.g)).toBe(true);
    const complete = fixture();
    complete.give("elephant", 3, 35);
    complete.offer("elephant");
    prepareBot(complete.g, complete.p, complete.actions);
    expect(
      complete.p.pieces.filter((p) => p.defId === "elephant"),
    ).toHaveLength(1);
    expect(complete.p.gold).toBe(1);
    expect(validGame(complete.g)).toBe(true);
  });
});
