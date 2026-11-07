import { afterEach, describe, expect, it } from "vitest";
import {
  createGame,
  buy,
  sell,
  roll,
  buyXp,
  move,
  startRound,
  settle,
  nextRound,
  resumeRound,
} from "../src/engine/game";
import {
  SERIES,
  randomBans,
  playableRotation,
  availableUnits,
  isRecruitable,
  rotationTraits,
} from "../src/engine/rotation";
import { COPIES, UNITS, RULES, UNIT } from "../src/data/units";
import { AI_PROFILES, profileFor } from "../src/data/ai-profiles";
import { validGame, decodeSave, SAVE_SCHEMA } from "../src/engine/persistence";
import { prepareBot } from "../src/engine/ai";
import { claimReward } from "../src/engine/equipment";
import { previewPurchase } from "../src/engine/recruitment";
import { compute } from "../src/compute/job";
import { rotationMarkup } from "../src/ui/rotation";
import {
  codexCards,
  codexFilters,
  filteredUnits,
  codexMarkup,
} from "../src/ui/unit-codex";
import { simulate } from "../src/engine/battle";
import frozen from "./fixtures/pre-v031-replays.json";
import type { Game } from "../src/engine/types";
const envelope = (game: Game, schema = SAVE_SCHEMA, rules = RULES.version) =>
  JSON.stringify({
    schema,
    rules,
    savedAt: 1,
    revision: 1,
    game,
    playback: { time: 2.5, speed: 2, paused: true },
  });
function stock(g: Game) {
  for (const p of g.players) {
    for (const id of p.shop) if (id) g.pool[id]++;
    p.shop = [null, null, null, null, null];
  }
}
function commander(g: Game) {
  const p = g.players[0],
    difficulty = g.difficulty;
  p.id = 1;
  p.aiProfile = g.players[1].aiProfile;
  g.difficulty = "standard";
  try {
    prepareBot(g, p, { buy, sell, roll, buyXp });
  } finally {
    p.id = 0;
    delete p.aiProfile;
    g.difficulty = difficulty;
  }
}
afterEach(() =>
  Object.assign(codexFilters, {
    availability: "all",
    query: "",
    cost: "all",
    trait: "all",
    star: 1,
    sort: "cost",
    range: "all",
  }),
);

describe("每局随机禁用三个种族", () => {
  it("固定种子可重现，全部种族均有机会，所有生成卡池保留费用与基础职业路径", () => {
    const seen = new Set<string>(),
      combinations = new Set<string>();
    for (let seed = 0; seed < 512; seed++) {
      const bans = randomBans(seed);
      expect(bans).toEqual(randomBans(seed));
      expect(new Set(bans).size).toBe(3);
      expect(playableRotation(bans)).toBe(true);
      bans.forEach((b) => seen.add(b));
      combinations.add(bans.join("/"));
      const g = createGame(seed);
      expect(g.bannedSeries).toEqual(bans);
      expect(validGame(g)).toBe(true);
      expect(
        g.players.every(
          (p) =>
            p.gold === 10 &&
            p.level === 3 &&
            p.hp === 100 &&
            p.pieces.length === 0,
        ),
      ).toBe(true);
      for (const p of g.players.slice(1))
        expect(
          availableUnits(g).filter((u) =>
            u.traits.includes(profileFor(p).traits[0]),
          ).length,
        ).toBeGreaterThanOrEqual(2);
    }
    expect([...seen].sort()).toEqual([...SERIES].sort());
    expect(combinations.size).toBeGreaterThan(100);
  });
  it("双种族命中任一禁用系列即禁用，共享池总份数为零；未禁用份数保持原规则", () => {
    const g = createGame(173);
    expect(g.bannedSeries).toContain("猛禽");
    expect(isRecruitable(g, "bloodhawk")).toBe(false);
    expect(
      isRecruitable({ bannedSeries: ["野兽", "装甲", "步兵"] }, "bloodhawk"),
    ).toBe(false);
    for (const u of UNITS) {
      const shops = g.players
        .flatMap((p) => p.shop)
        .filter((id) => id === u.id).length;
      expect(g.pool[u.id] + shops).toBe(
        isRecruitable(g, u.id) ? COPIES[u.cost] : 0,
      );
    }
  });
  it("玩家和七名AI刷新均不抽出禁用棋子，刷新付费与锁定商店遵循原规则", () => {
    const g = createGame(47),
      bans = [...g.bannedSeries!];
    for (let round = 0; round < 5; round++)
      for (const p of g.players) {
        const gold = p.gold;
        expect(roll(g, p)).toBe(true);
        expect(p.gold).toBe(gold - 2);
        expect(p.shop.every((id) => id === null || isRecruitable(g, id))).toBe(
          true,
        );
      }
    expect(validGame(g)).toBe(true);
    expect(g.bannedSeries).toEqual(bans);
    const p = g.players[0];
    p.gold = 10;
    expect(buy(g, p, 0)).toBe(true);
    move(g, p, p.pieces[0].uid, 35);
    p.locked = true;
    const shop = [...p.shop];
    const battle = startRound(g)!;
    settle(g, battle);
    if (g.reward) claimReward(g, 0);
    nextRound(g);
    expect(p.shop).toEqual(shop);
    expect(g.bannedSeries).toEqual(bans);
    expect(validGame(g)).toBe(true);
  });
  it("同费竞争减少提高单卡初始概率，费用档概率保持；按固定随机样本验证真实刷新", () => {
    const seed = Array.from({ length: 100 }, (_, i) => i).sort(
      (a, b) =>
        availableUnits(createGame(a)).filter((u) => u.cost === 1).length -
        availableUnits(createGame(b)).filter((u) => u.cost === 1).length,
    )[0];
    const rotating = createGame(seed),
      classic = createGame(seed, "classic");
    stock(rotating);
    stock(classic);
    const choices = availableUnits(rotating).filter((u) => u.cost === 1),
      target = choices[0].id;
    const sample = (g: Game) => {
      let hits = 0,
        ones = 0;
      for (let i = 0; i < 5000; i++) {
        roll(g, g.players[0], false);
        const id = g.players[0].shop[0]!;
        hits += Number(id === target);
        ones += Number(UNIT[id].cost === 1);
      }
      return { hit: hits / 5000, one: ones / 5000 };
    };
    const a = sample(rotating),
      b = sample(classic);
    expect(Math.abs(a.one - 0.75)).toBeLessThan(0.025);
    expect(Math.abs(b.one - 0.75)).toBeLessThan(0.025);
    expect(Math.abs(a.hit - 0.75 / choices.length)).toBeLessThan(0.025);
    expect(a.hit).toBeGreaterThan(b.hit * 1.2);
    expect(validGame(rotating)).toBe(true);
    expect(validGame(classic)).toBe(true);
  }, 20000);
  it("买卖和三星合成保持剩余池守恒，不改变三合一规则", () => {
    const g = createGame(173),
      p = g.players[0],
      id = availableUnits(g).find(
        (u) => u.cost === 1 && !u.traits.includes("异虫"),
      )!.id;
    stock(g);
    p.gold = 20;
    for (let i = 0; i < 9; i++) {
      p.shop[0] = id;
      g.pool[id]--;
      expect(buy(g, p, 0)).toBe(true);
    }
    expect(p.pieces).toHaveLength(1);
    expect(p.pieces[0].star).toBe(3);
    expect(p.gold).toBe(11);
    expect(validGame(g)).toBe(true);
    expect(sell(g, p, p.pieces[0].uid)).toBe(true);
    expect(g.pool[id]).toBe(COPIES[1]);
    expect(validGame(g)).toBe(true);
  });
  it("非法商店中的禁用棋子也不能购买，预览不改变金币或阵容", () => {
    const g = createGame(173),
      p = g.players[0],
      id = UNITS.find((u) => !isRecruitable(g, u.id))!.id;
    p.shop[0] = id;
    const before = structuredClone(g);
    expect(previewPurchase(g, p, 0)).toMatchObject({
      allowed: false,
      reason: "本局已禁用该系列",
      after: null,
    });
    expect(buy(g, p, 0)).toBe(false);
    expect(g).toEqual(before);
    expect(validGame(g)).toBe(false);
  });
  it.each(
    [
      [],
      ["野兽"],
      ["野兽", "野兽", "步兵"],
      ["野兽", "步兵", "护卫"],
      ["野兽", "步兵", "海神", "空军"],
      null,
      "野兽",
    ].map((value) => [value]),
  )("拒绝损坏禁用字段 %j", (value) => {
    const g = createGame(173);
    (g as any).bannedSeries = value;
    expect(validGame(g)).toBe(false);
    expect(decodeSave(envelope(g)).status).toBe("damaged");
  });
  it("禁用面板和图鉴标记成员、同费变化及不可达档位，可筛出本局棋子", () => {
    const g = createGame(173),
      text = rotationMarkup(g);
    for (const series of g.bannedSeries!) expect(text).toContain(series);
    expect(text).toContain("同费单卡初始占比");
    expect(text).toContain("不可达");
    codexFilters.availability = "available";
    expect(filteredUnits(g).map((u) => u.id)).toEqual(
      availableUnits(g)
        .sort((a, b) => a.cost - b.cost)
        .map((u) => u.id),
    );
    expect(codexCards(g)).not.toContain("本局禁用");
    codexFilters.availability = "banned";
    expect(filteredUnits(g).every((u) => !isRecruitable(g, u.id))).toBe(true);
    expect(codexCards(g)).toContain("本局禁用");
    expect(codexMarkup(g)).toContain("本局不可达");
    const before = structuredClone(g);
    rotationTraits(g);
    rotationMarkup(g);
    expect(g).toEqual(before);
  });
  it("存档往返与Worker保持禁用、商店、资源及同一回放，野怪不被招募禁用删掉", () => {
    const g = createGame(173);
    commander(g);
    const before = structuredClone(g),
      direct = structuredClone(g),
      result = startRound(direct)!;
    const worker = compute({ kind: "start", game: g });
    expect(worker).toEqual({ kind: "round", game: direct, result });
    expect(g).toEqual(before);
    const decoded = decodeSave(envelope(direct));
    expect(decoded.status).toBe("saved");
    expect(decoded.data!.game).toEqual(direct);
    expect(resumeRound(decoded.data!.game)!.battle).toEqual(result.battle);
    expect(result.kind).toBe("pve");
    expect(result.right.length).toBeGreaterThan(0);
  });
  it.each(["prepare", "battle", "result", "finished"] as const)(
    "旧0.30 %s保留完整卡池及回放，只升级信封",
    (phase) => {
      const g = createGame(137, "classic"),
        p = g.players[0];
      stock(g);
      p.shop[0] = phase === "finished" ? "fish" : "guard";
      g.pool[p.shop[0]]--;
      buy(g, p, 0);
      move(g, p, p.pieces[0].uid, 35);
      if (phase === "finished") p.hp = 1;
      if (phase !== "prepare") g.combatVersion = "armored";
      if (phase !== "prepare") {
        const result = startRound(g)!;
        if (phase === "result" || phase === "finished") settle(g, result);
      }
      expect(g.phase).toBe(phase);
      const decoded = decodeSave(envelope(g, 29, "singleplayer-0.30"));
      expect(decoded.status).toBe("migrated");
      expect(decoded.data!.game).toEqual(g);
      expect(decoded.data!.game.bannedSeries).toBeUndefined();
      expect(validGame(decoded.data!.game)).toBe(true);
    },
  );
  for (const fixture of frozen.fixtures)
    it(`既有战斗${fixture.name}不受招募禁用影响`, async () => {
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(simulate(fixture.left, fixture.right, "armored")),
        ),
      );
      expect(
        Array.from(new Uint8Array(hash), (x) =>
          x.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(fixture.hash);
    });
  it.each([
    ["relaxed", 173],
    ["standard", 47],
    ["veteran", 311],
  ] as const)(
    "%s完整对局：禁用不变化，淘汰回池与奖励保持合法",
    (difficulty, seed) => {
      const g = createGame(seed);
      g.difficulty = difficulty;
      const bans = [...g.bannedSeries!];
      let rounds = 0;
      while (g.phase !== "finished") {
        commander(g);
        expect(validGame(g)).toBe(true);
        const result = startRound(g)!;
        expect(result).not.toBeNull();
        settle(g, result);
        if (g.reward) claimReward(g, 0);
        nextRound(g);
        rounds++;
        expect(validGame(g)).toBe(true);
        expect(g.bannedSeries).toEqual(bans);
        expect(
          g.players.every((p) =>
            p.pieces.every((u) => isRecruitable(g, u.defId)),
          ),
        ).toBe(true);
        expect(rounds).toBeLessThanOrEqual(30);
      }
      expect(g.history.length).toBe(rounds);
      expect(rounds).toBeGreaterThan(3);
    },
    60000,
  );
});
