import { describe, it, expect } from "vitest";
import { createGame, startRound, settle } from "../src/engine/game";
import { matchSummary } from "../src/engine/match-summary";
import { matchSummaryMarkup } from "../src/ui/match-summary";
import type { Piece, RoundReport } from "../src/engine/types";

const insects = (): Piece[] =>
  ["blastbug", "wasp", "spider", "eyebug"].map((defId, i) => ({
    uid: 1000 + i,
    defId,
    star: 1,
    position: i === 3 ? null : 35 + i,
  }));

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
  it("淘汰前保存备战席，回收卡池后仍能还原四异虫进化", () => {
    const game = createGame(873, "classic"),
      player = game.players[0];
    player.pieces = insects();
    player.pieces[0].items = ["coil"];
    player.pieces[3].items = ["fortress"];
    player.inventory = ["blade", "blade", "core"];
    const inventory = player.inventory;
    game.nextUid = 1004;
    for (const piece of player.pieces) game.pool[piece.defId]--;
    const reserve = player.pieces[3],
      expected = structuredClone(reserve),
      result = startRound(game)!;
    // Exercise settlement's elimination branch independently of combat balance.
    result.battle.winner = 1;
    Object.assign(result.outcomes.find((o) => o.playerId === 0)!, {
      won: false,
      damage: 100,
    });
    settle(game, result);
    expect(player.pieces).toEqual([]);
    expect(player.inventory).toEqual([]);
    expect(game.history.at(-1)!.inventory).toEqual(["blade", "blade", "core"]);
    expect(game.history.at(-1)!.left[0].items).toEqual(["coil"]);
    expect(game.history.at(-1)!.bench).toEqual([expected]);
    expect(matchSummaryMarkup(game)).toContain("异虫 4 · 2 档");
    reserve.star = 2;
    reserve.items!.push("blade");
    inventory.push("plate");
    result.left[0].items!.push("core");
    expect(game.history.at(-1)!.bench).toEqual([expected]);
    expect(game.history.at(-1)!.inventory).toEqual(["blade", "blade", "core"]);
    expect(game.history.at(-1)!.left[0].items).toEqual(["coil"]);
  });
  it("备战异虫参与进化统计，备战灵能不增加上阵连携", () => {
    const game = createGame(undefined, "classic"),
      pieces = insects(),
      last = report(30, 0);
    game.phase = "finished";
    last.combatVersion = "lightning";
    last.left = [
      ...pieces.filter((piece) => piece.position !== null),
      { uid: 1004, defId: "adept", star: 1, position: 43 },
      { uid: 1005, defId: "acolyte", star: 1, position: 44 },
    ];
    last.bench = [
      pieces[3],
      { uid: 1006, defId: "stormcaller", star: 1, position: null },
      { uid: 1007, defId: "thunderlord", star: 1, position: null },
    ];
    game.history = [last];
    const before = structuredClone(game),
      html = matchSummaryMarkup(game);
    expect(html).toContain("异虫 4 · 2 档");
    expect(html).toContain("灵能 2 · 1 档");
    expect(html).not.toContain("灵能 4 · 2 档");
    expect(game).toEqual(before);
  });
  it("旧终局从存活阵容恢复备战；已淘汰旧局明确缺失，不猜异虫档位", () => {
    const game = createGame(undefined, "classic"),
      pieces = insects(),
      last = report(30, 0);
    game.phase = "finished";
    last.combatVersion = "lightning";
    last.left = pieces.filter((piece) => piece.position !== null);
    game.history = [last];
    game.players[0].pieces = pieces;
    expect(matchSummaryMarkup(game)).toContain("异虫 4 · 2 档");
    game.players[0].hp = 0;
    game.players[0].pieces = [];
    const html = matchSummaryMarkup(game);
    expect(html).toContain("异虫进化档位无法确认");
    expect(html).toContain("无可确认的上阵连携");
    expect(html).not.toMatch(/异虫 \d · \d 档/);
  });
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
