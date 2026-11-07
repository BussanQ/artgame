import type { Game } from "../engine/types";

export function restartMarkup(game: Game) {
  return `<div class="modal-backdrop"><section class="modal restart-modal" role="dialog" aria-modal="true" aria-labelledby="restart-title" aria-describedby="restart-description">
    <span class="eyebrow">NEW EXERCISE</span><h2 id="restart-title">重新开始演习？</h2>
    <p id="restart-description">当前为第 ${game.round} 回合。确认后将创建新演习，替换本局的阵容、装备和战报，并重新随机禁用 3 个系列。</p>
    <div class="restart-actions"><button data-action="close">继续本局</button><button class="primary" data-action="confirm-restart">确认重新开始</button></div>
  </section></div>`;
}
