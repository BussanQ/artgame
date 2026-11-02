import { startRound, resumeRound, type RoundResult } from "../engine/game";
import { simulate } from "../engine/battle";
import type { Battle, CombatVersion, Game, Piece } from "../engine/types";
export type ComputeJob =
  | { kind: "start" | "resume"; game: Game }
  | { kind: "replay"; left: Piece[]; right: Piece[]; version: CombatVersion };
export type ComputeResult =
  | { kind: "round"; game: Game; result: RoundResult }
  | { kind: "replay"; battle: Battle };
export type ComputeReply =
  | { ok: true; value: ComputeResult }
  | { ok: false; message: string };
/** Transaction boundary: no caller state changes until a complete result is accepted. */
export function compute(job: ComputeJob): ComputeResult {
  if (job.kind === "replay")
    return {
      kind: "replay",
      battle: simulate(job.left, job.right, job.version),
    };
  const game = structuredClone(job.game);
  const result = job.kind === "start" ? startRound(game) : resumeRound(game);
  if (!result) throw new Error("当前阶段或阵容不能开始战斗。");
  return { kind: "round", game, result };
}
