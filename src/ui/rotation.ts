import { UNITS } from "../data/units";
import { unitDefinition } from "../data/unit-stats";
import { CURRENT_COMBAT_VERSION } from "../engine/types";
import {
  availableUnits,
  rotationTraits,
  type RecruitmentContext,
} from "../engine/rotation";

export function rotationMarkup(game: RecruitmentContext) {
  if (!game.bannedSeries)
    return `<p class="rotation-legacy" title="本局沿用完整卡池；新开比赛将随机禁用 3 个种族系列。">完整卡池</p>`;
  const available = availableUnits(game),
    blocked = UNITS.map((u) =>
      unitDefinition(u.id, game.combatVersion ?? CURRENT_COMBAT_VERSION),
    ).filter((u) => !available.some((a) => a.id === u.id));
  const affected = rotationTraits(game).filter((t) => t.available < t.total);
  return `<details class="rotation-card" data-disclosure="rotation"><summary data-focus="rotation" aria-label="本局禁用：${game.bannedSeries.join("、")}；可招募 ${available.length}/${UNITS.length} 种，查看影响"><span class="eyebrow rotation-caption-full">本局禁用</span><span class="rotation-caption-short" aria-hidden="true">禁用3</span><span class="rotation-chips">${game.bannedSeries.map((t) => `<b>${t}</b>`).join("")}</span><span class="rotation-availability">可招募 <strong>${available.length}</strong> / ${UNITS.length} 种 <span class="micro">查看影响 ▾</span></span></summary><div class="rotation-content"><p class="rotation-selection">本局禁用：<b>${game.bannedSeries.join(" · ")}</b></p><p>开局随机禁用 3 个种族，整场固定，玩家与 7 名 AI 共用。双种族棋子命中任一禁用系列即移出招募池；野怪、召唤物与演示不受影响。</p><p>同费用内候选减少，更容易刷到同名棋子。费用档概率与升星规则不变，实际概率仍受等级、剩余份数和对手持有影响。</p><div class="rotation-columns"><section><h3>禁用棋子 · ${blocked.length} 种</h3><p class="rotation-units">${blocked.map((u) => `<span>${u.name}<small>${u.cost} 金 · ${u.traits.join(" / ")}</small></span>`).join("")}</p></section><section><h3>同费单卡初始占比</h3><table><thead><tr><th>费用</th><th>候选数</th><th>占比变化</th></tr></thead><tbody>${[
    1, 2, 3, 4, 5,
  ]
    .map((cost) => {
      const total = UNITS.filter((u) => u.cost === cost).length,
        left = available.filter((u) => u.cost === cost).length;
      return `<tr><td>${cost} 金</td><td>${total} → ${left}</td><td>${(100 / total).toFixed(1)}% → ${(100 / left).toFixed(1)}%</td></tr>`;
    })
    .join(
      "",
    )}</tbody></table><p class="micro">按初始同费卡池等份估算，尚未扣除八人商店和持有棋子；不是每个商店格的最终概率。</p><h3>受影响的羁绊</h3><div class="rotation-traits">${affected.map((t) => `<p><b>${t.trait}</b><span>${t.available}/${t.total} 种可用</span><small>${t.tiers.map((n) => `${n}档${n <= t.available ? "可达" : "不可达"}`).join(" · ")}</small></p>`).join("")}</div></section></div><p class="micro">对手从仍有核心成员的风格中分配，可能出现相同偏好。刷新页面与进入下一回合不会重新抽取禁用。</p></div></details>`;
}
