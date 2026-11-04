import { describe, it, expect } from "vitest";
import { createGame } from "../src/engine/game";
import { matchSummary } from "../src/engine/match-summary";
import { matchSummaryMarkup } from "../src/ui/match-summary";
import type { RoundReport } from "../src/engine/types";

const report = (
  round: number,
  winner: RoundReport["winner"],
  kind: RoundReport["kind"] = "pvp",
): RoundReport => ({
  round,
  winner,
  kind,
  combatVersion: "tactics",
  opponentId: kind === "pve" ? -1 : 1,
  opponentName: "对手",
  hp: 80,
  gold: 20,
  damage: winner === 0 ? 0 : 3,
  income: 7,
  left: [{ uid: 1, defId: "guard", star: 2, position: 35, items: ["aegis"] }],
  right: [],
});

describe("整局总结", () => {
  it("进行中的对局不提前生成最终排名", () => {
    const game = createGame(undefined, "classic");
    expect(matchSummary(game)).toBeNull();
    expect(matchSummaryMarkup(game)).toBe("");
  });
  it("野怪轮不打断对战连胜，对战平局会打断；累计收入不等于剩余金币", () => {
    const game = createGame(undefined, "classic");
    game.phase = "finished";
    game.history = [
      report(1, 0),
      report(2, 1, "pve"),
      report(3, 0),
      report(4, null),
      report(5, 0),
    ];
    const before = structuredClone(game);
    expect(matchSummary(game)).toMatchObject({
      wins: 3,
      losses: 0,
      draws: 1,
      pveWins: 0,
      pveRounds: 1,
      bestStreak: 2,
      totalIncome: 35,
      damageTaken: 6,
    });
    expect(game).toEqual(before);
  });
  it("最后一场野怪失利仍可能赢得整局，胜负标题按最终排名判定", () => {
    const game = createGame(undefined, "classic");
    game.phase = "finished";
    game.round = 30;
    game.players.forEach((p, i) => {
      p.hp = i === 0 ? 40 : 20;
    });
    game.history = Array.from({ length: 30 }, (_, i) =>
      report(i + 1, i === 29 ? 1 : 0, i === 29 ? "pve" : "pvp"),
    );
    expect(matchSummary(game)).toMatchObject({
      rank: 1,
      champion: true,
      reason: "round-limit",
    });
    const html = matchSummaryMarkup(game);
    expect(html).toContain("云海之巅");
    expect(html).toContain("按剩余生命确定排名");
    expect(html).toContain("守护壁垒");
    expect(html).toContain('data-watch-round="30"');
    game.players[1].hp = 50;
    expect(matchSummary(game)).toMatchObject({ rank: 2, champion: false });
    expect(matchSummaryMarkup(game)).not.toContain("云海之巅");
  });
  it("只剩指挥官存活时明确胜利原因；同回合全灭不授予冠军", () => {
    const game = createGame(undefined, "classic");
    game.phase = "finished";
    game.round = 22;
    game.history = [report(22, 0)];
    game.players.slice(1).forEach((p) => {
      p.hp = 0;
      p.eliminatedRound = 22;
    });
    expect(matchSummary(game)).toMatchObject({
      reason: "last-standing",
      champion: true,
    });
    expect(matchSummaryMarkup(game)).toContain("最后一位指挥官");
    game.players[0].hp = 0;
    game.players[0].eliminatedRound = 22;
    expect(matchSummary(game)).toMatchObject({
      reason: "eliminated",
      champion: false,
    });
  });
});
