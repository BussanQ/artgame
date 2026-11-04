import { army } from "../engine/battle";
import { ITEM, ITEMS } from "../data/items";
import { UNIT } from "../data/units";
import { encounterFor, encounterArmy } from "../data/encounters";
import { canCraft } from "../engine/equipment";
import type { Game } from "../engine/types";
export function equipmentMarkup(
  g: Game,
  selected: number | null,
  disabled: boolean,
) {
  const p = g.players[0],
    piece = p.pieces.find((x) => x.uid === selected);
  return `<section class="panel equipment-panel" id="armory"><div class="section-label"><div><span class="eyebrow">ARMORY</span><h2>装备工坊 <small>${p.inventory.length} 件库存</small></h2></div><span class="micro">选择棋子后点击库存装备 · 每枚最多 3 件</span></div><div class="equipped-slots">${piece ? `<b>${UNIT[piece.defId].name} · 已装备 ${(piece.items ?? []).length}/3</b>${(piece.items ?? []).map((id, i) => `<button data-unequip="${i}" ${disabled ? "disabled" : ""} title="${ITEM[id].description}">${ITEM[id].icon} ${ITEM[id].name} <small>卸下</small></button>`).join("")}` : '<span class="micro">可选中场上或备战席棋子；穿戴和卸下不消耗金币。</span>'}</div><div class="inventory-grid">${p.inventory.length ? p.inventory.map((id, i) => `<button data-equip="${i}" title="${ITEM[id].name}：${ITEM[id].description}" ${disabled || !piece || (piece.items?.length ?? 0) >= 3 ? "disabled" : ""}><span class="item-icon">${ITEM[id].icon}</span><b>${ITEM[id].name}</b><small>${ITEM[id].description}</small></button>`).join("") : '<p class="empty">挑战野怪获取装备。胜利可三选一，失利仍可二选一。</p>'}</div><details data-disclosure="recipes"><summary data-focus="recipes">合成配方 · ${ITEMS.filter((i) => i.recipe && canCraft(p, i.id)).length} 种可合成</summary><p class="micro">合成仅使用库存中的材料；已穿戴的材料需先卸下。成装不可拆分。</p><div class="recipe-grid">${ITEMS.filter(
    (i) => i.recipe,
  )
    .map(
      (i) =>
        `<button data-craft="${i.id}" ${disabled || !canCraft(p, i.id) ? "disabled" : ""}><b>${i.icon} ${i.name}</b><small>${i.recipe!.map((id) => ITEM[id].name).join(" + ")}</small><span>${i.description}</span></button>`,
    )
    .join("")}</div></details></section>`;
}
export function rewardMarkup(g: Game) {
  if (!g.reward) return "";
  return `<div class="modal-backdrop reward-backdrop"><section class="modal reward-modal" role="dialog" aria-modal="true" aria-label="选择战利品"><span class="eyebrow">FIELD SALVAGE</span><h2>选择你的战利品</h2><p>第 ${g.round} 回合 · ${g.history.at(-1)?.winner === 0 ? "挑战成功，三选一" : "休整补给，二选一"}。选择后自动进入下一回合。</p><div class="reward-grid">${g.reward.choices.map((id, i) => `<button data-reward="${i}"><span class="item-icon">${ITEM[id].icon}</span><b>${ITEM[id].name}</b><p>${ITEM[id].description}</p><small>领取并继续 →</small></button>`).join("")}</div><p class="micro">奖励已保存，刷新后仍可继续选择。</p></section></div>`;
}
export function encounterMarkup(g: Game) {
  const encounter = encounterFor(g);
  if (!encounter) return "";
  const defenders = army(encounterArmy(encounter), 1, g.combatVersion);
  return `<section class="panel intel encounter-brief" aria-label="本轮守军"><div><span class="eyebrow">NEUTRAL ENCOUNTER</span><h2>${encounter.name}</h2></div><div class="encounter-preview">${encounterArmy(
    encounter,
  )
    .map(
      (p) =>
        `<img src="/assets/units/${p.defId}.png" alt="${UNIT[p.defId].name} ${p.star} 星" title="${UNIT[p.defId].name} ${p.star} 星">`,
    )
    .join(
      "",
    )}</div><p class="encounter-hint">${encounter.hint}<small>野怪回合不改变连胜/连败 · 战后选择装备</small></p><details class="encounter-stats"><summary>查看守军属性</summary><p class="micro">包含本关强化与守军羁绊；攻击按初始值显示。</p><div class="defender-grid">${defenders.map((f) => `<div><b>${UNIT[f.defId].name} ${"★".repeat(f.star)}</b><span>生命 ${f.maxHp} · 攻击 ${Math.round(f.attack)}<br>护甲 ${f.armor} · 开战护盾 ${f.shield}</span></div>`).join("")}</div></details></section>`;
}
