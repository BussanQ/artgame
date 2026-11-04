import { describe, expect, it } from "vitest";
import {
  AI_PROFILES,
  opponentProfiles,
  profileFor,
} from "../src/data/ai-profiles";
import { RULES } from "../src/data/units";
import {
  createGame,
  buy,
  sell,
  roll,
  buyXp,
  startRound,
  settle,
  resumeRound,
} from "../src/engine/game";
import { prepareBot, deployLineup, savingsTarget } from "../src/engine/ai";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { random } from "../src/engine/random";
import { compute } from "../src/compute/job";
import { scoutingMarkup } from "../src/ui/scouting";
import type { Game, Player } from "../src/engine/types";

const envelope = (game: Game, schema = SAVE_SCHEMA, rules = RULES.version) =>
  JSON.stringify({
    schema,
    rules,
    savedAt: 1,
    revision: 1,
    game,
    playback: { time: 3, speed: 2, paused: true },
  });
function offers(g: Game, p: Player, ids: (string | null)[]) {
  for (const id of p.shop) if (id) g.pool[id]++;
  p.shop = ids;
  for (const id of ids) if (id) g.pool[id]--;
}

describe("新局对手构筑", () => {
  it("八种偏好各可出现，同局七种不重复，种子决定分配且不绑座位", () => {
    const seen = new Set<string>(),
      seatOne = new Set<string>(),
      lineups = new Set<string>();
    const omitted = new Set<string>();
    for (let seed = 0; seed < 64; seed++) {
      const ids = opponentProfiles(seed);
      expect(ids).toHaveLength(7);
      expect(new Set(ids).size).toBe(7);
      expect(ids).toEqual(opponentProfiles(seed));
      ids.forEach((id) => seen.add(id));
      AI_PROFILES.slice(1)
        .filter((p) => !ids.includes(p.id as (typeof ids)[number]))
        .forEach((p) => omitted.add(p.id));
      seatOne.add(ids[0]);
      lineups.add(ids.join("/"));
      const game = createGame(seed, "classic");
      expect(game.players.slice(1).map((p) => p.aiProfile)).toEqual(ids);
      expect(game.players[0].aiProfile).toBeUndefined();
      expect(validGame(game)).toBe(true);
    }
    expect([...seen].sort()).toEqual(
      AI_PROFILES.slice(1)
        .map((p) => p.id)
        .sort(),
    );
    expect(seatOne.size).toBeGreaterThan(1);
    expect(omitted.size).toBe(8);
    expect(lineups.size).toBeGreaterThan(1);
  });
  it("分配不消费招募随机流，也不赠送金币、经验或棋子", () => {
    const game = createGame(173, "classic"),
      rng = { seed: 173 };
    // Eight opening shops, five independent draws each, as before 0.28.
    for (let i = 0; i < 40; i++) random(rng);
    expect(game.seed).toBe(rng.seed);
    expect(
      game.players.every(
        (p) =>
          p.gold === 10 &&
          p.hp === 100 &&
          p.level === 3 &&
          p.xp === 0 &&
          p.pieces.length === 0 &&
          p.shop.length === 5,
      ),
    ).toBe(true);
    const copy = createGame(173, "classic");
    expect(copy).toEqual(game);
  });
  it("已保存风格覆盖座位：购买铁猿、攒息和布阵使用同一偏好", () => {
    const g = createGame(47, "classic"),
      p = g.players[1];
    p.aiProfile = "armor";
    p.gold = 2;
    offers(g, p, ["infantry", "ironape", null, null, null]);
    prepareBot(g, p, { buy, sell, roll, buyXp });
    expect(p.pieces.map((u) => u.defId)).toEqual(["ironape"]);
    expect(p.gold).toBe(0);
    expect(p.pieces[0].position).not.toBeNull();
    expect(validGame(g)).toBe(true);
    g.round = 12;
    expect(savingsTarget(g, p)).toBe(20);
    const moved = structuredClone(p);
    moved.id = 7;
    expect(savingsTarget(g, moved)).toBe(20);
    for (const unit of [
      "irondog",
      "chariot",
      "motorcycle",
      "titan",
      "bomber",
      "guard",
      "infantry",
    ])
      p.pieces.push({
        uid: 100 + p.pieces.length,
        defId: unit,
        star: 2,
        position: null,
      });
    p.level = 6;
    const second = structuredClone(p);
    second.id = 7;
    deployLineup(p, "standard");
    deployLineup(second, "standard");
    expect(p.pieces).toEqual(second.pieces);
    expect(profileFor(p).name).toBe("装甲爆破");
  });
  it.each([1, 2, 3, 4, 5, 6, 7])(
    "旧座位%i的未标记策略与显式旧策略行为相同",
    (seat) => {
      const legacy = createGame(311, "classic");
      for (const p of legacy.players) delete p.aiProfile;
      const explicit = structuredClone(legacy);
      const id = AI_PROFILES[seat].id;
      if (id === "free") throw new Error("Not a bot profile");
      explicit.players[seat].aiProfile = id;
      prepareBot(legacy, legacy.players[seat], { buy, sell, roll, buyXp });
      prepareBot(explicit, explicit.players[seat], { buy, sell, roll, buyXp });
      expect(profileFor(legacy.players[seat]).id).toBe(id);
      delete explicit.players[seat].aiProfile;
      expect(explicit).toEqual(legacy);
    },
  );
  it("侦察显示该玩家保存的风格，读取不改变策略、资源或阵容", () => {
    const g = createGame(173, "classic"),
      p = g.players[2];
    p.aiProfile = "armor";
    const before = structuredClone(g),
      markup = scoutingMarkup(g, p.id);
    expect(markup).toContain("装甲爆破");
    expect(markup).toContain("铁狗与铁猿");
    expect(markup).not.toContain("幽影猎杀");
    expect(g).toEqual(before);
  });
});

describe("策略存档、迁移与Worker", () => {
  it("当前存档往返保留分配，下一轮计算与Worker一致且不修改调用方", () => {
    const g = createGame(173, "classic");
    expect(buy(g, g.players[0], 0)).toBe(true);
    g.players[0].pieces[0].position = 35;
    const decoded = decodeSave(envelope(g));
    expect(decoded.status).toBe("saved");
    expect(decoded.data!.game).toEqual(g);
    const before = structuredClone(g),
      expected = structuredClone(g),
      result = startRound(expected)!;
    const worker = compute({ kind: "start", game: decoded.data!.game });
    expect(worker).toEqual({ kind: "round", game: expected, result });
    expect(g).toEqual(before);
    expect(validGame(expected)).toBe(true);
    expect(expected.players.map((p) => p.aiProfile)).toEqual(
      before.players.map((p) => p.aiProfile),
    );
    const restored = decodeSave(envelope(expected)).data!.game;
    expect(resumeRound(restored)!.battle).toEqual(result.battle);
  });
  it.each(["prepare", "battle", "result", "finished"] as const)(
    "旧0.27 %s迁移不重新分配，不改变经济、战报和播放位置",
    (phase) => {
      const g = createGame(137, "classic"),
        me = g.players[0];
      for (const p of g.players) delete p.aiProfile;
      let result: ReturnType<typeof startRound> = null;
      if (phase !== "prepare") {
        offers(g, me, [
          phase === "finished" ? "fish" : "guard",
          null,
          null,
          null,
          null,
        ]);
        expect(buy(g, me, 0)).toBe(true);
        me.pieces[0].position = 35;
        if (phase === "finished") me.hp = 1;
        result = startRound(g);
        if (phase === "result" || phase === "finished") settle(g, result!);
      }
      expect(g.phase).toBe(phase);
      const before = structuredClone(g),
        decoded = decodeSave(envelope(g, 26, "singleplayer-0.27"));
      expect(decoded.status).toBe("migrated");
      expect(decoded.data).toMatchObject({
        schema: SAVE_SCHEMA,
        rules: RULES.version,
        playback: { time: 3, speed: 2, paused: true },
      });
      expect(decoded.data!.game).toEqual(before);
      expect(
        decoded.data!.game.players.slice(1).map((p) => profileFor(p).id),
      ).toEqual(AI_PROFILES.slice(1, 8).map((p) => p.id));
      if (phase === "battle")
        expect(resumeRound(decoded.data!.game)!.battle).toEqual(result!.battle);
    },
  );
  it.each(["unknown", "free", "__proto__", 1, null, {}])(
    "拒绝损坏的AI策略字段 %j",
    (value) => {
      const game = JSON.parse(JSON.stringify(createGame(173, "classic")));
      game.players[1].aiProfile = value;
      expect(validGame(game)).toBe(false);
      expect(decodeSave(envelope(game)).status).toBe("damaged");
    },
  );
  it("玩家本人不能被存档偷偷切换为AI策略", () => {
    const game = createGame(173, "classic");
    game.players[0].aiProfile = "armor";
    expect(validGame(game)).toBe(false);
  });
});
