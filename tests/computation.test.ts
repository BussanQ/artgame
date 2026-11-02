import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compute,
  type ComputeJob,
  type ComputeReply,
} from "../src/compute/job";
import {
  BattleComputer,
  ComputationCancelled,
  type WorkerPort,
} from "../src/compute/client";
import {
  createGame,
  buy,
  move,
  startRound,
  resumeRound,
  settle,
  nextRound,
} from "../src/engine/game";
import { simulate } from "../src/engine/battle";
import { claimReward } from "../src/engine/equipment";
import { validGame } from "../src/engine/persistence";
function ready() {
  const g = createGame(137);
  buy(g, g.players[0], 0);
  move(g, g.players[0], g.players[0].pieces[0].uid, 35);
  return g;
}
function mockWorker() {
  let job: ComputeJob;
  const port: WorkerPort = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: vi.fn((value) => {
      job = structuredClone(value);
    }),
    terminate: vi.fn(),
  };
  return {
    port,
    done: () =>
      port.onmessage?.({
        data: { ok: true, value: compute(job) },
      } as MessageEvent<ComputeReply>),
  };
}
afterEach(() => vi.useRealTimers());
describe("异步战斗事务", () => {
  it.each(["legacy", "tactics", "balanced", "signature"] as const)(
    "%s 开战、恢复、回放逐帧等价，工作副本不改原对局",
    (version) => {
      const game = ready();
      game.combatVersion = version;
      const before = structuredClone(game),
        expected = structuredClone(game),
        direct = startRound(expected)!;
      const reply = compute({ kind: "start", game });
      expect(reply.kind).toBe("round");
      if (reply.kind !== "round") throw new Error("wrong result");
      expect(reply.game).toEqual(expected);
      expect(reply.result).toEqual(direct);
      expect(game).toEqual(before);
      expect(validGame(reply.game)).toBe(true);
      const saved = structuredClone(reply.game),
        resume = compute({ kind: "resume", game: reply.game });
      expect(resume).toEqual(reply);
      expect(reply.game).toEqual(saved);
      const replay = compute({
        kind: "replay",
        left: direct.left,
        right: direct.right,
        version,
      });
      expect(replay).toEqual({ kind: "replay", battle: direct.battle });
      settle(reply.game, reply.result);
      expect(validGame(reply.game)).toBe(true);
      const settled = structuredClone(reply.game);
      settle(reply.game, reply.result);
      expect(reply.game).toEqual(settled);
    },
  );
  it("AI 轻量战果与完整模拟相同，覆盖野怪与 PvP", () => {
    const g = ready();
    for (let round = 1; round <= 4; round++) {
      const result = startRound(g)!;
      expect(result).not.toBeNull();
      const alive = g.players.filter((p) => p.hp > 0);
      for (const p of alive) {
        const opponent =
          result.kind === "pve" || p.id === 0
            ? result.opponent
            : alive[
                (alive.indexOf(p) + 1 + ((g.round - 1) % (alive.length - 1))) %
                  alive.length
              ];
        const full = simulate(p.pieces, opponent.pieces, g.combatVersion);
        expect(result.outcomes.find((o) => o.playerId === p.id)).toEqual({
          playerId: p.id,
          won: full.winner === 0,
          damage: full.winner === 0 ? 0 : full.damage,
        });
      }
      expect(resumeRound(g)).toEqual(result);
      settle(g, result);
      if (g.reward) claimReward(g, 0);
      nextRound(g);
      expect(validGame(g)).toBe(true);
    }
  });
  it("空阵容或错误阶段失败时不扣金币，不留下半完成 AI 准备", () => {
    const game = createGame(),
      before = structuredClone(game);
    expect(() => compute({ kind: "start", game })).toThrow();
    expect(() => compute({ kind: "resume", game })).toThrow();
    expect(game).toEqual(before);
  });
  it("取消立即终止计算，迟到消息无法覆盖下一次请求", async () => {
    const first = mockWorker(),
      second = mockWorker();
    let n = 0;
    const computer = new BattleComputer(() => [first.port, second.port][n++]);
    const old = computer.run({ kind: "start", game: ready() });
    const rejected = expect(old).rejects.toBeInstanceOf(ComputationCancelled);
    const next = computer.run({ kind: "start", game: ready() });
    await rejected;
    expect(first.port.terminate).toHaveBeenCalledTimes(1);
    first.done();
    second.done();
    expect((await next).kind).toBe("round");
    expect(second.port.terminate).toHaveBeenCalledTimes(1);
  });
  it("超时、线程异常、消息失败后都清理资源并可重新计算", async () => {
    vi.useFakeTimers();
    for (const reason of ["timeout", "error", "message"]) {
      const w = mockWorker(),
        computer = new BattleComputer(() => w.port);
      const pending = computer.run({ kind: "start", game: ready() });
      const rejected = expect(pending).rejects.toThrow();
      if (reason === "timeout") await vi.advanceTimersByTimeAsync(30000);
      else if (reason === "error") w.port.onerror?.({} as ErrorEvent);
      else w.port.onmessageerror?.({} as MessageEvent);
      await rejected;
      expect(w.port.terminate).toHaveBeenCalledTimes(1);
      const retried = computer.run({ kind: "start", game: ready() });
      w.done();
      expect((await retried).kind).toBe("round");
    }
  });
  it("创建失败、发送失败和规则拒绝以错误返回，不悬挂请求", async () => {
    const failed = new BattleComputer(() => {
      throw new Error("unavailable");
    });
    await expect(failed.run({ kind: "start", game: ready() })).rejects.toThrow(
      "无法启动",
    );
    const w = mockWorker(),
      computer = new BattleComputer(() => w.port);
    vi.mocked(w.port.postMessage).mockImplementationOnce(() => {
      throw new Error("clone");
    });
    await expect(
      computer.run({ kind: "start", game: ready() }),
    ).rejects.toThrow("无法提交");
    const refused = computer.run({ kind: "start", game: ready() });
    w.port.onmessage?.({
      data: { ok: false, message: "规则拒绝" },
    } as MessageEvent<ComputeReply>);
    await expect(refused).rejects.toThrow("规则拒绝");
  });
});
