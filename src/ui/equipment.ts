import { unitSprite } from "../data/unit-stats";
import { army } from "../engine/battle";
import { ITEM, ITEMS } from "../data/items";
import { UNIT } from "../data/units";
import { encounterFor, encounterArmy } from "../data/encounters";
import { canCraft } from "../engine/equipment";
import { finalPlayerSnapshot } from "../engine/match-summary";
import type { Game, Player, Piece } from "../engine/types";
/** Project the final record for display, without changing ownership or the shared pool. */
export function equipmentView(g: Game) {
  const final = finalPlayerSnapshot(g);
  return {
    player: final
      ? {
          ...g.players[0],
          pieces: [...final.lineup, ...(final.bench ?? [])],
          inventory: final.inventory ?? [],
        }
      : g.players[0],
    version: final?.combatVersion ?? g.combatVersion,
    isFinal: g.phase === "finished",
    inventoryKnown: !final || final.inventory !== undefined,
    reservesKnown: !final || final.bench !== undefined,
  };
}
function snapshotNote(view: ReturnType<typeof equipmentView>) {
  const notes = [
    !view.inventoryKnown
      ? "本局未保留终局背包，仅展示已记录的装备。"
      : "",
    !view.reservesKnown
      ? "本局未保留终局备战席，持有人仅包含最终出战阵容。"
      : "",
  ].filter(Boolean);
  return notes.length
    ? `<p class="micro equipment-snapshot-note">${notes.join("")}</p>`
    : "";
}
function itemCounts(ids: string[]) {
  return ids.reduce<Record<string, number>>((counts, id) => {
    counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, {});
}
export function equipmentLocation(piece: Piece, pieces: Piece[]) {
  return piece.position === null
    ? `备战席 ${pieces.filter((p) => p.position === null).findIndex((p) => p.uid === piece.uid) + 1}`
    : `场上 ${String.fromCharCode(65 + (piece.position % 8))}${Math.floor(piece.position / 8) + 1}`;
}
/** Read-only inventory and wearer ledger; duplicate copies and reserve units are included. */
export function equipmentOverview(
  player: Pick<Player, "inventory" | "pieces">,
) {
  const inventory = itemCounts(player.inventory);
  return ITEMS.map((item) => {
    const owners = player.pieces.flatMap((piece) => {
      const copies = (piece.items ?? []).filter((id) => id === item.id).length;
      return copies
        ? [{ piece, copies, location: equipmentLocation(piece, player.pieces) }]
        : [];
    });
    const equippedCount = owners.reduce((n, owner) => n + owner.copies, 0);
    return {
      item,
      inventoryCount: inventory[item.id] ?? 0,
      equippedCount,
      total: (inventory[item.id] ?? 0) + equippedCount,
      owners,
    };
  });
}
function ownerName(piece: Piece, pieces: Piece[]) {
  return `${UNIT[piece.defId].name} ${"★".repeat(piece.star)} · ${equipmentLocation(piece, pieces)}`;
}
export function equipmentOverviewMarkup(g: Game, heldOnly = false) {
  const view = equipmentView(g),
    { player, isFinal, inventoryKnown, reservesKnown, version } = view,
    entries = equipmentOverview(player),
    held = entries.filter((e) => e.total > 0),
    equippedCount = entries.reduce((n, e) => n + e.equippedCount, 0);
  const shown = heldOnly ? held : entries;
  const inventoryLabel = inventoryKnown ? `${player.inventory.length} 件` : "未记录",
    equippedLabel = reservesKnown ? "装备中" : "已记录穿戴",
    heldLabel = inventoryKnown && reservesKnown ? (isFinal ? "终局持有" : "持有") : "已记录";
  return `<div class="modal-backdrop"><section class="modal equipment-overview-modal" role="dialog" aria-modal="true" aria-label="装备总览"><button class="close" data-action="close" aria-label="关闭">×</button><span class="eyebrow">EQUIPMENT LEDGER</span><h2>${isFinal ? "终局装备总览" : "装备总览"}</h2><p class="equipment-ledger-summary">${heldLabel} ${player.inventory.length + equippedCount} 件 · 背包 ${inventoryLabel} · ${equippedLabel} ${equippedCount} 件</p>${snapshotNote(view)}<div class="equipment-ledger-filters"><button data-action="equipment-all" aria-pressed="${!heldOnly}">全部装备 ${entries.length}</button><button data-action="equipment-held" aria-pressed="${heldOnly}">${isFinal ? (inventoryKnown && reservesKnown ? "终局持有" : "已记录") : "已持有"} ${held.length} 种</button></div><p class="micro">${isFinal ? "终局回顾：点击持有人查看最后的星级、装备与阵位。" : "包含你的背包、场上与备战席棋子。点击持有人可选中该棋子并返回工坊；对手装备可在侦察中查看。"}</p>${[
    false,
    true,
  ]
    .map((crafted) => {
      const rows = shown.filter((e) => !!e.item.recipe === crafted);
      if (!rows.length) return "";
      return `<section class="equipment-ledger-section"><h3>${crafted ? "合成装备" : "基础装备"} · ${rows.length} 种</h3><div class="equipment-ledger-grid">${rows.map(({ item, inventoryCount, equippedCount, total, owners }) => `<article data-equipment-item="${item.id}" aria-label="${item.name}" class="equipment-ledger-card${total ? " is-owned" : ""}"><h4><span class="item-icon">${item.icon}</span>${item.name}</h4><p>${item.description}</p><p class="equipment-ledger-counts">背包 <b>${inventoryKnown ? inventoryCount : "未记录"}</b> · ${equippedLabel} <b>${equippedCount}</b></p><div class="equipment-ledger-owners">${owners.length ? owners.map(({ piece, copies, location }) => `<button data-equipment-owner="${piece.uid}" aria-label="查看${UNIT[piece.defId].name}${piece.star}星${location}的装备"><img src="/assets/units/${unitSprite(piece.defId, version)}.png" alt=""><span>${UNIT[piece.defId].name} ${"★".repeat(piece.star)}<small>${location}${copies > 1 ? ` · ×${copies}` : ""}</small></span></button>`).join("") : `<small>${inventoryCount ? (isFinal ? "终局背包中" : "当前在背包中") : !inventoryKnown || !reservesKnown ? "暂无持有记录" : isFinal ? "终局未持有" : "尚未持有"}</small>`}</div>${item.recipe ? `<small class="equipment-ledger-recipe">配方：${item.recipe.map((id) => ITEM[id].name).join(" + ")}</small>` : '<small class="equipment-ledger-recipe">野怪回合战利品</small>'}</article>`).join("")}</div></section>`;
    })
    .join(
      "",
    )}${!shown.length ? `<p class="empty">${isFinal ? "本局没有可回顾的装备记录" : "尚未持有装备"}；切换“全部装备”查看属性与配方。</p>` : ""}</section></div>`;
}
export function equipmentMarkup(
  g: Game,
  selected: number | null,
  disabled: boolean,
) {
  const view = equipmentView(g),
    { player: p, isFinal, inventoryKnown, reservesKnown, version } = view,
    piece = !isFinal ? p.pieces.find((x) => x.uid === selected) : undefined,
    carriers = p.pieces.filter((x) => x.items?.length),
    equippedCount = carriers.reduce((n, x) => n + x.items!.length, 0);
  disabled ||= isFinal;
  return `<section class="panel equipment-panel" id="armory"><div class="section-label"><div><span class="eyebrow">ARMORY</span><h2>装备工坊 <small>${isFinal ? "终局 · " : ""}${inventoryKnown ? `${p.inventory.length} 背包` : "背包未记录"} · ${equippedCount} ${reservesKnown ? "已装" : "已记录穿戴"}</small></h2></div><span class="micro">${isFinal ? "终局回顾 · 点击持有人查看最后阵容" : "选择棋子后点击库存装备 · 每枚最多 3 件"}</span></div>${snapshotNote(view)}<button class="armory-overview-button" data-action="equipment-overview">全部装备 · ${ITEMS.length} 种<span>查看属性、配方与持有人 →</span></button>${
    carriers.length
      ? `<details class="armory-owner-list" data-disclosure="equipment-owners"><summary data-focus="equipment-owners">已穿戴 · ${equippedCount} 件 · ${carriers.length} 枚棋子</summary>${carriers
          .map(
            (x) =>
              `<button data-equipment-owner="${x.uid}" class="armory-owner${!isFinal && x.uid === selected ? " is-selected" : ""}"><img src="/assets/units/${unitSprite(x.defId, version)}.png" alt=""><span><b>${ownerName(x, p.pieces)}</b><small>${Object.entries(
                itemCounts(x.items!),
              )
                .map(
                  ([id, count]) =>
                    `${ITEM[id].name}${count > 1 ? ` ×${count}` : ""}`,
                )
                .join(" · ")}</small></span></button>`,
          )
          .join("")}</details>`
      : ""
  }<div class="equipped-slots">${piece ? `<b>${ownerName(piece, p.pieces)} · 已装备 ${(piece.items ?? []).length}/3</b>${(piece.items ?? []).map((id, i) => `<button data-unequip="${i}" ${disabled ? "disabled" : ""} title="${ITEM[id].description}">${ITEM[id].icon} ${ITEM[id].name} <small>卸下</small></button>`).join("")}` : isFinal ? "" : '<span class="micro">可选中场上或备战席棋子；穿戴和卸下不消耗金币。</span>'}</div><div class="inventory-grid">${p.inventory.length ? p.inventory.map((id, i) => `<button data-equip="${i}" title="${ITEM[id].name}：${ITEM[id].description}" ${disabled || !piece || (piece.items?.length ?? 0) >= 3 ? "disabled" : ""}><span class="item-icon">${ITEM[id].icon}</span><b>${ITEM[id].name}</b><small>${ITEM[id].description}</small></button>`).join("") : !inventoryKnown ? "" : `<p class="empty">${isFinal ? "终局背包为空。" : "挑战野怪获取装备。胜利可三选一，失利仍可二选一。"}</p>`}</div><details data-disclosure="recipes"><summary data-focus="recipes">合成配方 · ${ITEMS.filter((i) => i.recipe && (isFinal || canCraft(p, i.id))).length} 种${isFinal ? "" : "可合成"}</summary><p class="micro">${isFinal ? "本局已结束，可查看配方与装备属性。" : "合成仅使用库存中的材料；已穿戴的材料需先卸下。成装不可拆分。"}</p><div class="recipe-grid">${ITEMS.filter(
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
        `<img src="/assets/units/${unitSprite(p.defId, g.combatVersion)}.png" alt="${UNIT[p.defId].name} ${p.star} 星" title="${UNIT[p.defId].name} ${p.star} 星">`,
    )
    .join(
      "",
    )}</div><p class="encounter-hint">${encounter.hint}<small>野怪回合不改变连胜/连败 · 战后选择装备</small></p><details class="encounter-stats"><summary>查看守军属性</summary><p class="micro">包含本关强化与守军羁绊；攻击按初始值显示。</p><div class="defender-grid">${defenders.map((f) => `<div><b>${UNIT[f.defId].name} ${"★".repeat(f.star)}</b><span>生命 ${f.maxHp} · 攻击 ${Math.round(f.attack)}<br>护甲 ${f.armor} · 开战护盾 ${f.shield}</span></div>`).join("")}</div></details></section>`;
}
