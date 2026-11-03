import { ITEM } from "../data/items";
import type { Game } from "../engine/types";
export function historyMarkup(game: Game) {
  const canReplay = game.phase === "prepare" || game.phase === "finished";
  return `<div class="modal-backdrop"><section class="modal history-modal" role="dialog" aria-modal="true" aria-label="本局战报"><button class="close" data-action="close" aria-label="关闭">×</button><span class="eyebrow">MATCH HISTORY</span><h2>本局战报</h2><p>记录每回合的对手、收益与生命变化。回放不会影响当前阵容或经济。</p>${
    game.history.length
      ? `<div class="history-list">${[...game.history]
          .reverse()
          .map(
            (r) =>
              `<article class="history-row"><div><b>第 ${r.round} 回合</b><small>对阵 ${r.opponentName}${r.kind === "pve" ? " · 野怪" : ""}</small></div><strong class="${r.winner === 0 ? "won" : "lost"}">${r.winner === 0 ? "胜利" : r.winner === 1 ? "失败" : "平局"}</strong><div><span>生命 ${r.hp} <small>（−${r.damage}）</small></span><span>金币 ${r.gold} <small>（+${r.income}）</small></span>${r.reward ? `<small>战利品：${ITEM[r.reward].name}</small>` : ""}</div><div class="history-actions"><button data-watch-round="${r.round}" ${canReplay ? "" : "disabled"}>观看回放</button><button data-analyze-round="${r.round}" ${canReplay ? "" : "disabled"}>战斗分析</button></div></article>`,
          )
          .join("")}</div>`
      : '<p class="empty">尚无战报。完成第一场战斗后会自动记录。</p>'
  }${canReplay ? "" : '<p class="micro">当前战斗结束后可观看历史回放。</p>'}</section></div>`;
}
