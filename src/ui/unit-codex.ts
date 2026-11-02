import { TRAIT_TIERS } from "../data/traits";
import { UNITS, TRAITS } from "../data/units";
import { SKILLS, skillDescription } from "../data/skills";

export const codexFilters = { cost: "all", trait: "all", star: 1 };
export function codexCards() {
  const units = UNITS.filter(
    (u) =>
      (codexFilters.cost === "all" || u.cost === Number(codexFilters.cost)) &&
      (codexFilters.trait === "all" ||
        u.traits.some((t) => t === codexFilters.trait)),
  );
  const scale = 2 ** (codexFilters.star - 1);
  return units.length
    ? units
        .map(
          (u) =>
            `<article><img class="codex-portrait" src="/assets/units/${u.id}.png" alt="${u.name}"><strong style="color:${u.color}">${u.name} <span class="codex-stars">${"★".repeat(codexFilters.star)}</span></strong><small>${u.cost} 金 · ${u.traits.join(" / ")} · ${SKILLS[u.id].role}</small><p>生命 ${u.hp * scale} · 攻击 ${u.attack * scale}<br>护甲 ${u.armor} · 射程 ${u.range} · 间隔 ${u.interval * 0.25} 秒</p><b class="codex-skill">${SKILLS[u.id].name}</b><p class="skill-description">${skillDescription(u.id)}</p></article>`,
        )
        .join("")
    : '<p class="empty">没有符合筛选条件的棋子。</p>';
}
export function codexMarkup() {
  return `<p>${UNITS.length} 种棋子各有独立技能。星级提升生命与攻击，护盾和治疗按技能说明计算。以下采用单机平衡数值。</p><div class="codex-filters"><label>费用<select data-codex="cost" aria-label="按费用筛选"><option value="all">全部费用</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${codexFilters.cost === String(n) ? "selected" : ""}>${n} 金</option>`).join("")}</select></label><label>羁绊<select data-codex="trait" aria-label="按羁绊筛选"><option value="all">全部羁绊</option>${Object.keys(
    TRAITS,
  )
    .map(
      (t) =>
        `<option ${codexFilters.trait === t ? "selected" : ""}>${t}</option>`,
    )
    .join(
      "",
    )}</select></label><label>星级<select data-codex="star" aria-label="查看星级属性">${[1, 2, 3].map((n) => `<option value="${n}" ${codexFilters.star === n ? "selected" : ""}>${n} 星</option>`).join("")}</select></label></div><div class="codex-grid" aria-live="polite">${codexCards()}</div><details class="trait-handbook"><summary>羁绊梯度 · 同名棋子仅计一次，备战不参与</summary><div class="trait-handbook-grid">${Object.entries(
    TRAIT_TIERS,
  )
    .map(
      ([name, tiers]) =>
        `<article><b>${name}</b>${tiers.map((t) => `<p>${t.count} 个不同棋子：${t.description}</p>`).join("")}</article>`,
    )
    .join("")}</div></details>`;
}
