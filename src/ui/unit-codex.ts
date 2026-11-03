import { TRAIT_TIERS } from "../data/traits";
import { UNITS, TRAITS } from "../data/units";
import { skillName, skillRole, skillDescription } from "../data/skills";

export const codexFilters = {
  cost: "all",
  trait: "all",
  star: 1,
  query: "",
  sort: "cost",
  range: "all",
};
const escapeAttribute = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
export function filteredUnits() {
  const words = codexFilters.query
    .normalize("NFKC")
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return UNITS.filter(
    (u) =>
      (codexFilters.cost === "all" || u.cost === Number(codexFilters.cost)) &&
      (codexFilters.trait === "all" ||
        u.traits.some((t) => t === codexFilters.trait)) &&
      (codexFilters.range === "all" ||
        (codexFilters.range === "melee"
          ? u.range === 1
          : codexFilters.range === "ranged"
            ? u.range > 1
            : !!u.flying)) &&
      words.every((word) =>
        `${u.name} ${u.id} ${u.traits.join(" ")} ${skillName(u.id)} ${skillRole(u.id)} ${skillDescription(u.id)}`
          .normalize("NFKC")
          .toLocaleLowerCase()
          .includes(word),
      ),
  ).sort(
    (a, b) =>
      (codexFilters.sort === "attack"
        ? b.attack - a.attack
        : codexFilters.sort === "hp"
          ? b.hp - a.hp
          : codexFilters.sort === "range"
            ? b.range - a.range
            : a.cost - b.cost) || a.cost - b.cost,
  );
}
export function codexCount() {
  return `找到 ${filteredUnits().length} / ${UNITS.length} 种棋子`;
}
export function refreshCodex(root: HTMLElement) {
  const grid = root.querySelector(".codex-grid");
  if (grid) grid.innerHTML = codexCards();
  const count = root.querySelector(".codex-count");
  if (count) count.textContent = codexCount();
}
export function resetCodex(root: HTMLElement) {
  Object.assign(codexFilters, {
    cost: "all",
    trait: "all",
    star: 1,
    query: "",
    sort: "cost",
    range: "all",
  });
  root
    .querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-codex]")
    .forEach((input) => {
      input.value = String(
        codexFilters[input.dataset.codex as keyof typeof codexFilters],
      );
    });
  refreshCodex(root);
}
export function codexCards() {
  const units = filteredUnits();
  const scale = 2 ** (codexFilters.star - 1);
  return units.length
    ? units
        .map(
          (u) =>
            `<article><img class="codex-portrait" src="/assets/units/${u.id}.png" alt="${u.name}"><strong style="color:${u.color}">${u.name} <span class="codex-stars">${"★".repeat(codexFilters.star)}</span></strong><small>${u.cost} 金 · ${u.flying ? "飞行" : "地面"} · ${u.traits.join(" / ")} · ${skillRole(u.id)}</small><p>生命 ${u.hp * scale} · 攻击 ${u.attack * scale}<br>护甲 ${u.armor} · 射程 ${u.range} · 间隔 ${u.interval * 0.25} 秒</p><b class="codex-skill">${skillName(u.id)}</b><p class="skill-description">${skillDescription(u.id)}</p></article>`,
        )
        .join("")
    : '<p class="empty">没有符合条件的棋子。请缩短关键词，或将费用、羁绊和攻击方式改为全部。</p>';
}
export function codexMarkup() {
  return `<p>${UNITS.length} 种棋子各有独立技能。星级提升生命与攻击，护盾和治疗按技能说明计算。以下采用单机平衡数值。</p><label class="codex-search">搜索棋子与能力<input type="search" data-codex="query" aria-label="搜索棋子与能力" placeholder="名称、羁绊或技能，例如：治疗、空军" value="${escapeAttribute(codexFilters.query)}"></label><div class="codex-filters"><label>费用<select data-codex="cost" aria-label="按费用筛选"><option value="all">全部费用</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${codexFilters.cost === String(n) ? "selected" : ""}>${n} 金</option>`).join("")}</select></label><label>羁绊<select data-codex="trait" aria-label="按羁绊筛选"><option value="all">全部羁绊</option>${Object.keys(
    TRAITS,
  )
    .map(
      (t) =>
        `<option ${codexFilters.trait === t ? "selected" : ""}>${t}</option>`,
    )
    .join(
      "",
    )}</select></label><label>星级<select data-codex="star" aria-label="查看星级属性">${[1, 2, 3].map((n) => `<option value="${n}" ${codexFilters.star === n ? "selected" : ""}>${n} 星</option>`).join("")}</select></label><label>攻击方式<select data-codex="range" aria-label="按攻击方式筛选">${[
    ["all", "全部方式"],
    ["melee", "近战"],
    ["ranged", "远程"],
    ["flying", "飞行"],
  ]
    .map(
      ([v, label]) =>
        `<option value="${v}" ${codexFilters.range === v ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label><label>排序<select data-codex="sort" aria-label="图鉴排序">${[
    ["cost", "费用从低到高"],
    ["attack", "攻击从高到低"],
    ["hp", "生命从高到低"],
    ["range", "射程从远到近"],
  ]
    .map(
      ([v, label]) =>
        `<option value="${v}" ${codexFilters.sort === v ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label></div><div class="codex-result-bar"><p class="codex-count" role="status">${codexCount()}</p><button data-action="codex-reset">重置图鉴</button></div><div class="codex-grid">${codexCards()}</div><details class="trait-handbook"><summary>羁绊梯度 · 同名仅计一次，异虫包含备战席</summary><div class="trait-handbook-grid">${Object.entries(
    TRAIT_TIERS,
  )
    .map(
      ([name, tiers]) =>
        `<article><b>${name}</b>${tiers.map((t) => `<p>${t.count} 个不同棋子：${t.description}</p>`).join("")}</article>`,
    )
    .join("")}</div></details>`;
}
