import { describe, it, expect } from "vitest";
import {
  createGame,
  buy,
  sell,
  roll,
  buyXp,
  startRound,
  settle,
  nextRound,
  rankings,
} from "../src/engine/game";
import { prepareBot } from "../src/engine/ai";
import { claimReward, itemScore } from "../src/engine/equipment";
import { validGame, SaveStore } from "../src/engine/persistence";
import { simulate } from "../src/engine/battle";
import { matchSummary } from "../src/engine/match-summary";
import { matchSummaryMarkup } from "../src/ui/match-summary";
import type { Difficulty } from "../src/engine/types";

describe("完整单机对局", () => {
  it.each([
    [42, "relaxed", 1],
    [87, "standard", 2],
    [20261102, "standard", 5],
    [617, "veteran", 4],
  ] as const)(
    "种子 %i / %s / 构筑 %i 从招募到终局保持合法",
    (seed, difficulty: Difficulty, profile) => {
      let game = createGame(seed);
      game.difficulty = difficulty;
      const storage = new Map<string, string>();
      const port = {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      };
      const saves = new SaveStore(port);
      saves.load();
      const playback = { time: 0, speed: 4 as const, paused: false };
      while (game.phase !== "finished") {
        // Exercise ordinary paid commands with a repeatable commander policy.
        // The temporary profile selects preferences only; no currency/cards are granted.
        const player = game.players[0];
        player.id = profile;
        try {
          prepareBot(game, player, { buy, sell, roll, buyXp });
        } finally {
          player.id = 0;
        }
        expect(validGame(game), `prepare ${game.round}`).toBe(true);
        const result = startRound(game);
        expect(result).not.toBeNull();
        expect(validGame(game), `battle ${game.round}`).toBe(true);
        settle(game, result!);
        expect(validGame(game), `result ${game.round}`).toBe(true);
        expect(saves.save(game, playback)).toBe("saved");
        // Refresh with an unclaimed reward or completed result: resuming must not duplicate income.
        const resumed = saves.load().data;
        expect(resumed?.game).toEqual(game);
        game = resumed!.game;
        if (game.reward) {
          // The commander makes a repeatable equipment choice instead of always taking slot 0.
          const best = game.reward.choices
            .map((id, index) => ({
              index,
              score: Math.max(
                0,
                ...game.players[0].pieces.map((p) => itemScore(p, id)),
              ),
            }))
            .sort((a, b) => b.score - a.score)[0];
          expect(claimReward(game, best.index)).toBe(true);
        }
        nextRound(game);
        expect(validGame(game), `advance ${game.round}`).toBe(true);
        expect(game.round).toBeLessThanOrEqual(30);
      }
      const finished = structuredClone(game);
      nextRound(game);
      expect(game).toEqual(finished);
      expect(game.history).toHaveLength(game.round);
      const summary = matchSummary(game)!;
      expect(summary.rank).toBe(
        rankings(game).findIndex((p) => p.id === 0) + 1,
      );
      expect(
        summary.wins + summary.losses + summary.draws + summary.pveRounds,
      ).toBe(game.round);
      expect(summary.damageTaken).toBe(100 - game.players[0].hp);
      expect(summary.lineup.length).toBeGreaterThan(0);
      const markup = matchSummaryMarkup(game);
      expect(markup).toContain('aria-label="整局总结"');
      for (const p of summary.lineup)
        expect(markup).toContain(`/assets/units/${p.defId}.png`);
      if (game.players[0].hp === 0) {
        expect(game.players[0].pieces).toHaveLength(0);
        expect(summary.reason).toBe("eliminated");
      }
      // Balance updates can alter when a seeded campaign ends.
      if (
        game.round === 30 &&
        game.players[0].hp > 0 &&
        game.players.filter((p) => p.hp > 0).length > 1
      ) {
        expect(summary.reason).toBe("round-limit");
      }
      const last = game.history.at(-1)!;
      expect(simulate(last.left, last.right, last.combatVersion).winner).toBe(
        last.winner,
      );
      expect(game).toEqual(finished);
    },
    30000,
  );
});

it("第30回合结算后结束，即使多名玩家存活也不能进入31回合", () => {
  const g = createGame(137);
  g.round = 30;
  const p = g.players[0];
  buy(g, p, p.shop.findIndex(Boolean));
  p.pieces[0].position = 35;
  const r = startRound(g)!;
  settle(g, r);
  expect(p.hp).toBeGreaterThan(0);
  expect(g.players.filter((p) => p.hp > 0).length).toBeGreaterThan(1);
  expect(g.phase).toBe("finished");
  expect(matchSummary(g)?.reason).toBe("round-limit");
  const before = structuredClone(g);
  nextRound(g);
  expect(g).toEqual(before);
});
