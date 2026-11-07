import { startRound, resumeRound, type RoundResult } from "../engine/game";
import { simulate } from "../engine/battle";
import { deployLineup, planTactically, type TacticalPlan } from "../engine/ai";
import type { PiecePosition } from "../engine/deployment";
import type { Battle, CombatVersion, Game, Piece } from "../engine/types";
export type ComputeJob =
  | { kind: "start" | "resume"; game: Game }
  | { kind: "deploy"; game: Game }
  | { kind: "replay"; left: Piece[]; right: Piece[]; version: CombatVersion };
export type ComputeResult =
  | { kind: "round"; game: Game; result: RoundResult }
  | { kind:"deployment";positions:PiecePosition[];opponent:TacticalPlan["opponent"]|null;trials:number }
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
  if(job.kind==="deploy"){
    const player=game.players[0];
    if(game.phase!=="prepare"||game.reward||player.hp<=0||!player.pieces.length)
      throw new Error("准备阶段持有棋子时可推荐布阵。");
    const plan=planTactically(game,player,{maximumTrials:20,equipInventory:false});
    if(!plan)deployLineup(player,game.difficulty==="relaxed"?"standard":game.difficulty,"spread",game.combatVersion);
    return {kind:"deployment",positions:plan?.positions??player.pieces.map(({uid,position})=>({uid,position})),
      opponent:plan?.opponent??null,trials:plan?.trials??0};
  }
  const result = job.kind === "start" ? startRound(game) : resumeRound(game);
  if (!result) throw new Error("当前阶段或阵容不能开始战斗。");
  return { kind: "round", game, result };
}
