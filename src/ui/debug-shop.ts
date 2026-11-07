import { catalogUnit } from "../data/catalog";
import { RULES } from "../data/units";
import type { Game } from "../engine/types";

const escape = (value: string) => value.replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function debugShopMarkup(game: Game, busy: boolean, command: string,
  notice: { ok: boolean; message: string } | null, quantity = "1") {
  const queue = game.debugShopQueue ?? [];
  const disabled = busy ? "disabled" : "";
  return `<div class="modal-backdrop"><section class="modal manual-modal debug-shop-modal" role="dialog" aria-modal="true" aria-label="后台模式">
    <header class="manual-header"><div><span class="eyebrow">SHOP COMMANDS</span><h2>后台模式</h2></div><button class="close" data-action="close" aria-label="关闭">×</button></header>
    <div class="manual-body"><p>输入 <code>/兵种完整名称</code>，让它出现在下次商店刷新中。</p>
    <form data-debug-command-form class="debug-command-form"><div><label for="debug-command">招募指令<input id="debug-command" data-focus="debug-command" aria-describedby="debug-command-hint" value="${escape(command)}" maxlength="48" placeholder="/投石车" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" ${disabled}></label><label for="debug-quantity">数量<input id="debug-quantity" type="number" data-focus="debug-quantity" min="1" max="${RULES.shop}" step="1" inputmode="numeric" value="${escape(quantity)}" aria-describedby="debug-command-hint" enterkeyhint="send" ${disabled}></label><button type="submit" data-action="debug-submit" ${disabled}>加入下次刷新</button></div></form>
    <p id="debug-command-hint" class="debug-command-hint">使用图鉴中的完整名称，设置数量后按 Enter 提交。单次 1–${RULES.shop} 枚，队列剩余 ${RULES.shop - queue.length} 格；容量或库存不足时整批不添加。棋子均为一星，仍需按原价购买，可安排当前等级未开放的兵种。</p>
    <p class="debug-command-notice ${notice?.ok ? "success" : ""}" role="status" aria-live="polite">${busy ? "当前只可查看，请在准备阶段输入或移除指令。" : notice ? escape(notice.message) : "每枚棋子成功刷新后移出队列。"}</p>
    <div class="debug-queue-heading"><h3>待刷新 <span>${queue.length} / ${RULES.shop}</span></h3><button data-action="debug-clear" ${busy || !queue.length ? "disabled" : ""}>清空</button></div>
    <ol class="debug-shop-queue">${queue.map((id, index) => {
      const unit = catalogUnit(game, id);
      const stock = (game.pool[id] ?? 0) + game.players[0].shop.filter((slot) => slot === id).length;
      const reserved = queue.slice(0, index + 1).filter((slot) => slot === id).length;
      return `<li><span class="debug-queue-number">${index + 1}</span><div><b>${escape(unit.name)} <small>★ · ${unit.cost} 金</small></b><small>${stock >= reserved ? escape(unit.traits.join(" / ")) : "等待共享卡池补充"}</small></div><button data-action="debug-remove" data-debug-index="${index}" aria-label="移除第 ${index + 1} 条${escape(unit.name)}指令" ${disabled}>移除</button></li>`;
    }).join("") || '<li class="debug-queue-empty">暂无指令，下次刷新按正常概率招募。</li>'}</ol>
    <p class="debug-command-hint">手动刷新及未锁定商店的回合刷新均可生效。金币、禁用系列和共享卡池照常；若棋子临时缺货，该条指令保留至有货时。</p></div>
  </section></div>`;
}
