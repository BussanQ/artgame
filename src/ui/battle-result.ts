import type { Battle } from "../engine/types";
export const RESULT_DURATION_MS = 2600;
export interface ResultPresentation {
  winner: Battle["winner"];
  startedAt: number;
  round: number;
  damage: number;
  income: number;
  terminal: boolean;
  rank: number;
  demo?: boolean;
}
export function resultMarkup(result: ResultPresentation | null): string {
  if (!result) return "";
  const kind =
    result.winner === 0 ? "victory" : result.winner === 1 ? "defeat" : "draw";
  const title =
    result.winner === 0 ? "胜 利" : result.winner === 1 ? "失 败" : "平 局";
  const label =
    result.winner === 0 ? "VICTORY" : result.winner === 1 ? "DEFEAT" : "DRAW";
  const elapsed = Math.max(0, performance.now() - result.startedAt);
  const subtitle = result.demo
    ? "演示结束 · 即将重新播放"
    : result.terminal
      ? `演习结束 · 最终排名 #${result.rank}`
      : "战报已结算 · 即将进入下一回合";
  const icon =
    result.winner === 0
      ? '<path d="M32 23 42 40 56 15 70 40 80 23 75 65H37Z"/><path d="M38 76H74M38 85H74"/><path class="crest-leaves" d="M24 35Q5 58 29 82M88 35Q107 58 83 82M19 46 10 42M18 57 7 55M21 69 11 72M93 46 102 42M94 57 105 55M91 69 101 72"/>'
      : result.winner === 1
        ? '<path d="M56 12 88 26 84 62Q78 84 56 96 34 84 28 62L24 26Z"/><path d="M60 17 46 44 66 49 48 77 56 91"/>'
        : '<path d="M28 22H84L79 76 56 95 33 76Z"/><path d="M40 47H72M40 61H72"/>';
  return `<div class="battle-result ${kind} ${result.terminal ? "terminal" : ""}" style="--result-elapsed:-${elapsed}ms;--result-duration:${RESULT_DURATION_MS}ms" role="status" aria-live="polite" aria-atomic="true"><div class="result-veil"></div><div class="result-burst"></div><div class="result-ring"></div><div class="result-particles" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i};--angle:${i * 20}deg;--travel:${90 + (i % 4) * 28}px"></i>`).join("")}</div><div class="result-plaque"><span class="result-round">${result.demo ? "兵种演习" : `第 ${String(result.round).padStart(2, "0")} 回合`}</span><svg class="result-crest" viewBox="0 0 112 108" aria-hidden="true">${icon}</svg><h2>${title}</h2><span class="result-english">${label}</span><div class="result-divider"></div><p class="result-rewards">${result.demo ? "战斗演示" : `生命 ${result.damage > 0 ? `−${result.damage}` : "未损失"} <span>·</span> 金币 +${result.income}`}</p><p class="result-next">${subtitle}</p>${result.terminal ? "" : '<div class="result-countdown" aria-hidden="true"><i></i></div>'}</div></div>`;
}
