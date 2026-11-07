import type { synergies } from "../engine/synergies";

type Formation = ReturnType<typeof synergies>[number];
export function synergyRow(s: Formation) {
  const key = `trait-${s.trait}`;
  return `<details class="synergy-detail ${s.active ? "active" : s.conflicted ? "conflicted" : ""}" data-disclosure="${key}"><summary data-focus="${key}"><span class="trait-icon">${s.conflicted ? "!" : s.active ? "◆" : "◇"}</span><b>${s.trait}</b><span class="synergy-count">${s.conflicted ? `${s.count}种` : `${s.count}/${s.threshold}`}<small>${s.conflicted ? "冲突" : s.tier ? `${s.tier} 档` : "未激活"}</small></span></summary><p>${s.description}</p><small class="micro">梯度 ${s.tiers.join(" / ")}</small></details>`;
}

/** Conflicts stay visible without opening the inactive list. */
export function synergyPanelMarkup(formations: Formation[], demo = false) {
  const visible = formations.filter((s) => s.active || s.conflicted);
  const inactive = formations.filter((s) => !s.active && !s.conflicted);
  return `<div class="panel-title"><h2>${demo ? "演示阵容连携" : "阵容连携"}</h2><span>${formations.filter((s) => s.active).length} 已激活</span></div>${
    formations.length
      ? `${visible.map(synergyRow).join("")}${inactive.length ? `<details class="inactive-synergies" data-disclosure="inactive-synergies"><summary data-focus="inactive-synergies">未激活连携 · ${inactive.length}</summary>${inactive.map(synergyRow).join("")}</details>` : ""}`
      : '<p class="empty">部署不同棋子，<br>组合兵种与职业连携。</p>'
  }<p class="micro">点开连携查看效果<br>同名仅计一次 · 异虫包含备战席</p>`;
}
