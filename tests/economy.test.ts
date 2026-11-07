import { describe, expect, it } from "vitest";
import { baseIncome, income, incomeBreakdown } from "../src/engine/economy";
import {
  buy,
  createGame,
  move,
  nextRound,
  resumeRound,
  settle,
} from "../src/engine/game";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { RULES } from "../src/data/units";
import type { Game, RoundReport } from "../src/engine/types";

/** Legal late-round state with historical payouts from the former flat economy. */
function fixture(round: number) {
  const game = createGame(137, "classic"),
    player = game.players[0];
  buy(game, player, 0);
  move(game, player, player.pieces[0].uid, 35);
  game.round = round;
  game.history = Array.from(
    { length: round - 1 },
    (_, i): RoundReport => ({
      round: i + 1,
      combatVersion: game.combatVersion,
      opponentId: 1,
      opponentName: game.players[1].name,
      kind: "pvp",
      winner: 0,
      damage: 0,
      income: 5,
      hp: 100,
      gold: 10,
      left: structuredClone(player.pieces),
      right: [],
    }),
  );
  game.phase = "battle";
  expect(validGame(game)).toBe(true);
  const result = resumeRound(game)!;
  // Controlled outcomes isolate payout ordering from battle strength.
  result.battle.winner = 0;
  result.battle.damage = 0;
  for (const outcome of result.outcomes)
    Object.assign(outcome, { won: true, damage: 0 });
  return { game, player, result };
}

describe("随回合增长的金币收入", () => {
  it("每五轮基础奖励增长，前期不变，后期封顶15金", () => {
    expect(Array.from({ length: 30 }, (_, i) => baseIncome(i + 1))).toEqual([
      ...Array(5).fill(5),
      ...Array(5).fill(7),
      ...Array(5).fill(9),
      ...Array(5).fill(11),
      ...Array(5).fill(13),
      ...Array(5).fill(15),
    ]);
    expect(baseIncome(31)).toBe(15);
    expect(income({ gold: 0, streak: 0 }, false, 25)).toBe(13);
    expect(income({ gold: 50, streak: 9 }, true, 26)).toBe(24);
  });

  it.each([
    [9, 0],
    [10, 1],
    [49, 4],
    [50, 5],
    [100, 5],
  ])("%i金余额的利息仍为%i，不把新增基础收入提前计息", (gold, interest) => {
    expect(incomeBreakdown({ gold, streak: -9 }, false, 21)).toEqual({
      base: 13,
      interest,
      victory: 0,
      streak: 3,
      total: 16 + interest,
    });
  });

  it("玩家和7个AI均按本轮档位发放，先更新连胜再计息且只结算一次", () => {
    const { game, result } = fixture(21);
    for (const player of game.players)
      Object.assign(player, { gold: 49, streak: 2 });
    const previousHistory = structuredClone(game.history);
    settle(game, result);
    expect(game.players.every((p) => p.gold === 68 && p.streak === 3)).toBe(
      true,
    );
    expect(game.history.at(-1)).toMatchObject({
      round: 21,
      income: 19,
      gold: 68,
    });
    expect(game.history.slice(0, -1)).toEqual(previousHistory);
    expect(validGame(game)).toBe(true);
    const settled = structuredClone(game);
    settle(game, result);
    expect(game).toEqual(settled);
    nextRound(game);
    expect(game.round).toBe(22);
    expect(game.players.every((p) => p.gold === 68)).toBe(true);
    expect(validGame(game)).toBe(true);
  });

  it("连败也获得递增基础奖励；当轮淘汰不再发钱", () => {
    const { game, result } = fixture(21);
    for (const player of game.players)
      Object.assign(player, { gold: 9, streak: -2 });
    game.players[7].hp = 3;
    result.battle.winner = 1;
    result.battle.damage = 3;
    for (const outcome of result.outcomes)
      Object.assign(outcome, { won: false, damage: 3 });
    settle(game, result);
    expect(
      game.players.slice(0, 7).every((p) => p.gold === 23 && p.streak === -3),
    ).toBe(true);
    expect(game.players[7]).toMatchObject({
      hp: 0,
      gold: 9,
      eliminatedRound: 21,
    });
    expect(game.history.at(-1)).toMatchObject({ income: 14, gold: 23 });
    expect(validGame(game)).toBe(true);
  });

  it("野怪轮按回合增长，不产生对战胜利奖或改变原连胜连败", () => {
    const { game, result } = fixture(20);
    expect(result.kind).toBe("pve");
    for (const player of game.players)
      Object.assign(player, { gold: 50, streak: -5 });
    settle(game, result);
    // Base 11 + interest 5 + existing streak 1, no PvP victory bonus.
    expect(game.players.every((p) => p.gold === 67 && p.streak === -5)).toBe(
      true,
    );
    expect(game.history.at(-1)?.income).toBe(17);
    expect(game.reward?.round).toBe(20);
    expect(validGame(game)).toBe(true);
  });

  it.each(["prepare", "battle", "result", "finished"] as const)(
    "0.21的%s存档保留已有金币和战报，新奖励只在未结算回合发放",
    (phase) => {
      const { game, result } = fixture(phase === "finished" ? 30 : 21);
      if (phase === "prepare") game.phase = "prepare";
      if (phase === "result" || phase === "finished") {
        settle(game, result);
        // Encode the payout that the former 5-gold rule would have made.
        const extra = baseIncome(game.round) - 5;
        for (const player of game.players)
          if (player.hp > 0) player.gold -= extra;
        game.history.at(-1)!.gold -= extra;
        game.history.at(-1)!.income -= extra;
      }
      expect(game.phase).toBe(phase);
      expect(validGame(game)).toBe(true);
      const before = structuredClone(game);
      const decoded = decodeSave(
        JSON.stringify({
          schema: 20,
          rules: "singleplayer-0.21",
          savedAt: 1,
          revision: 1,
          game,
          playback: { time: 0, speed: 1, paused: false },
        }),
      );
      expect(decoded.status).toBe("migrated");
      expect(decoded.data).toMatchObject({
        schema: SAVE_SCHEMA,
        rules: RULES.version,
        game: before,
      });
      const restored: Game = decoded.data!.game;
      if (phase === "battle") {
        const replay = resumeRound(restored)!;
        const oldGold = restored.players[0].gold;
        settle(restored, replay);
        expect(restored.players[0].gold - oldGold).toBe(
          income(
            {
              ...restored.players[0],
              gold: oldGold,
            },
            replay.kind === "pvp" && replay.battle.winner === 0,
            21,
          ),
        );
        expect(validGame(restored)).toBe(true);
      } else if (phase === "result" || phase === "finished") {
        settle(restored, result);
        expect(restored).toEqual(before);
      }
    },
  );
});
