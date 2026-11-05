import { describe, expect, it } from "vitest";
import {
  AI_PROFILES,
  opponentProfiles,
  profileFor,
} from "../src/data/ai-profiles";
import { RULES } from "../src/data/units";
import { chooseLineup, prepareBot, savingsTarget } from "../src/engine/ai";
import {
  createGame,
  buy,
  sell,
  roll,
  buyXp,
  move,
  startRound,
  settle,
  resumeRound,
} from "../src/engine/game";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { availableUnits, isRecruitable } from "../src/engine/rotation";
import { synergies } from "../src/engine/synergies";
import { compute } from "../src/compute/job";
import { scoutingMarkup } from "../src/ui/scouting";
import type { Piece, RoundReport } from "../src/engine/types";

function fullReserve() {
  const g = createGame(137, "classic"),
    p = g.players[1];
  g.round = 18;
  // Synthetic, valid historical reports isolate the late-round reserve decision.
  g.history = Array.from(
    { length: 17 },
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
  p.aiProfile = "puppets";
  p.level = 8;
  p.gold = 1;
  for (const player of g.players) {
    for (const id of player.shop) if (id) g.pool[id]++;
    player.shop = [null, null, null, null, null];
  }
  const give = (defId: string, star: number, position: number | null) => {
    const piece: Piece = { uid: g.nextUid++, defId, star, position };
    g.pool[defId] -= 3 ** (star - 1);
    p.pieces.push(piece);
    return piece;
  };
  for (const [i, id] of [
    "adept",
    "shark",
    "swordthrall",
    "bladethrall",
    "shieldthrall",
    "wolf",
    "titan",
    "guard",
  ].entries())
    give(id, 2, 32 + i);
  for (const id of [
    "vine",
    "vine",
    "lion",
    "lion",
    "fish",
    "monk",
    "guard",
    "cavalry",
  ])
    give(id, 1, null);
  p.shop[0] = "axethrall";
  g.pool.axethrall--;
  expect(validGame(g)).toBe(true);
  return { g, p };
}

describe("傀儡卫阵经营", () => {
  it("傀儡禁用时不分配该风格，海神禁用时仍可构筑六傀儡", () => {
    const banned = availableUnits({ bannedSeries: ["傀儡", "猛禽", "陆行者"] });
    const seaBanned = availableUnits({
      bannedSeries: ["海神", "猛禽", "陆行者"],
    });
    expect(seaBanned.filter((u) => u.traits.includes("傀儡"))).toHaveLength(6);
    let seen = false;
    for (let seed = 0; seed < 64; seed++) {
      expect(opponentProfiles(seed, banned)).not.toContain("puppets");
      seen ||= opponentProfiles(seed, seaBanned).includes("puppets");
    }
    expect(seen).toBe(true);
  });

  it("用付费招募选择核心拼图，储蓄和策略不绑定座位", () => {
    const g = createGame(91, "classic"),
      p = g.players[1];
    p.aiProfile = "puppets";
    for (const id of p.shop) if (id) g.pool[id]++;
    p.shop = ["infantry", "adept", null, null, null];
    g.pool.infantry--;
    g.pool.adept--;
    p.gold = 2;
    prepareBot(g, p, { buy, sell, roll, buyXp });
    expect(p.pieces.map((u) => u.defId)).toEqual(["adept"]);
    expect(p.gold).toBe(0);
    expect(p.pieces[0].position).not.toBeNull();
    expect(validGame(g)).toBe(true);
    g.round = 12;
    expect(savingsTarget(g, p)).toBe(20);
    expect(savingsTarget(g, { ...p, id: 7 })).toBe(20);
    expect(profileFor(p).name).toBe("傀儡卫阵");
    expect(scoutingMarkup(g, p.id)).toContain("收集不同傀儡形成四人核心");
  });

  it.each(["standard", "veteran"] as const)(
    "%s选阵保留可用六傀儡，计数不靠重复棋子",
    (difficulty) => {
      const p = createGame(91, "classic").players[1];
      p.aiProfile = "puppets";
      p.level = 8;
      p.pieces = [
        "adept",
        "shark",
        "axethrall",
        "swordthrall",
        "bladethrall",
        "shieldthrall",
        "wolf",
        "titan",
        "guard",
        "infantry",
      ].map(
        (defId, i): Piece => ({ uid: i + 100, defId, star: 2, position: null }),
      );
      const before = structuredClone(p);
      const lineup = chooseLineup(p, difficulty);
      expect(lineup).toHaveLength(8);
      expect(new Set(lineup.map((u) => u.uid)).size).toBe(8);
      expect(
        synergies(lineup.map((u, i) => ({ ...u, position: 32 + i }))).find(
          (s) => s.trait === "傀儡",
        ),
      ).toMatchObject({ count: 6, tier: 3 });
      expect(p).toEqual(before);
    },
  );

  it("五缺一时付费补齐第六种，满备战只卖过渡棋子并保留已有核心", () => {
    const { g, p } = fullReserve();
    const core = p.pieces.slice(0, 5).map((u) => u.uid);
    const sold: string[] = [];
    prepareBot(g, p, {
      buy,
      roll,
      buyXp,
      sell(game, player, uid) {
        sold.push(player.pieces.find((u) => u.uid === uid)!.defId);
        return sell(game, player, uid);
      },
    });
    expect(p.pieces.some((u) => u.defId === "axethrall")).toBe(true);
    expect(core.every((uid) => p.pieces.some((u) => u.uid === uid))).toBe(true);
    expect(sold).toHaveLength(1);
    expect(["vine", "lion", "fish", "monk", "guard", "cavalry"]).toContain(
      sold[0],
    );
    expect(p.gold).toBeGreaterThanOrEqual(0);
    expect(p.gold).toBeLessThanOrEqual(4);
    expect(validGame(g)).toBe(true);
  });

  it("海神与灵能联合禁用后只计划四人档，不为不可达六人档打破储蓄线", () => {
    const { g, p } = fullReserve();
    // Return the now-banned sea units and their offers before applying this fixture's bans.
    for (const piece of p.pieces.filter((u) =>
      ["shark", "fish", "adept"].includes(u.defId),
    )) {
      g.pool[piece.defId] += 3 ** (piece.star - 1);
    }
    p.pieces = p.pieces.filter(
      (u) => !["shark", "fish", "adept"].includes(u.defId),
    );
    p.pieces.push({
      uid: g.nextUid++,
      defId: "staffthrall",
      star: 2,
      position: null,
    });
    g.pool.staffthrall -= 3;
    g.bannedSeries = ["海神", "灵能", "猛禽"];
    for (const unit of availableUnits({}).filter(
      (u) => !isRecruitable(g, u.id),
    ))
      g.pool[unit.id] = 0;
    const before = structuredClone(p.pieces);
    prepareBot(g, p, { buy, sell, roll, buyXp });
    expect(p.pieces.some((u) => u.defId === "axethrall")).toBe(false);
    expect(p.pieces.map((u) => u.uid)).toEqual(before.map((u) => u.uid));
    expect(p.gold).toBe(1);
    expect(validGame(g)).toBe(true);
  });
});

describe("0.36策略存档升级", () => {
  it("当前傀儡策略在存档与Worker中保留，计算不修改调用方", () => {
    const g = createGame(91, "classic");
    g.players[1].aiProfile = "puppets";
    expect(buy(g, g.players[0], 0)).toBe(true);
    expect(move(g, g.players[0], g.players[0].pieces[0].uid, 35)).toBe(true);
    const decoded = decodeSave(
      JSON.stringify({
        schema: SAVE_SCHEMA,
        rules: RULES.version,
        savedAt: 1,
        revision: 1,
        game: g,
        playback: { time: 0, speed: 1, paused: false },
      }),
    );
    expect(decoded.status).toBe("saved");
    expect(decoded.data!.game).toEqual(g);
    const before = structuredClone(g),
      expected = structuredClone(g);
    const result = startRound(expected)!;
    expect(compute({ kind: "start", game: decoded.data!.game })).toEqual({
      kind: "round",
      game: expected,
      result,
    });
    expect(expected.players[1].aiProfile).toBe("puppets");
    expect(g).toEqual(before);
    expect(validGame(expected)).toBe(true);
  });
  it.each(["prepare", "battle", "result", "finished"] as const)(
    "%s保留整局分配、资源、历史和回放位置",
    (phase) => {
      const g = createGame(137, "classic");
      for (const p of g.players.slice(1))
        if (p.aiProfile === "puppets") p.aiProfile = "armor";
      delete g.players[7].aiProfile;
      for (const p of g.players) {
        for (const id of p.shop) if (id) g.pool[id]++;
        p.shop = [null, null, null, null, null];
      }
      const me = g.players[0];
      me.shop[0] = phase === "finished" ? "fish" : "guard";
      g.pool[me.shop[0]]--;
      expect(buy(g, me, 0)).toBe(true);
      expect(move(g, me, me.pieces[0].uid, 35)).toBe(true);
      if (phase === "finished") me.hp = 1;
      const result = phase === "prepare" ? null : startRound(g);
      if (phase === "result" || phase === "finished") settle(g, result!);
      expect(g.phase).toBe(phase);
      const before = structuredClone(g);
      const decoded = decodeSave(
        JSON.stringify({
          schema: 35,
          rules: "singleplayer-0.36",
          savedAt: 1,
          revision: 1,
          game: g,
          playback: { time: 4, speed: 2, paused: true },
        }),
      );
      expect(decoded.status).toBe("migrated");
      expect(decoded.data).toMatchObject({
        schema: SAVE_SCHEMA,
        rules: RULES.version,
        playback: { time: 4, speed: 2, paused: true },
      });
      expect(decoded.data!.game).toEqual(before);
      expect(validGame(decoded.data!.game)).toBe(true);
      if (phase === "battle")
        expect(resumeRound(decoded.data!.game)!.battle).toEqual(result!.battle);
      expect(AI_PROFILES[7].id).toBe("psychic");
      expect(profileFor(decoded.data!.game.players[7]).id).toBe("psychic");
    },
  );
});
