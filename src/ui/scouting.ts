import { unitSprite } from "../data/unit-stats";
import { UNIT } from "../data/units";
import { ITEM } from "../data/items";
import { profileFor, DIFFICULTIES } from "../data/ai-profiles";
import { synergies } from "../engine/synergies";
import type { Game } from "../engine/types";
export function scoutingMarkup(g: Game, id: number) {
  const p = g.players[id],
    profile = profileFor(p),
    onboard = p.pieces.filter((x) => x.position !== null),
    traits = synergies(p.pieces, g.combatVersion);
  return `<div class="modal-backdrop"><section class="modal scout-modal" role="dialog" aria-modal="true" aria-label="对手侦察"><button class="close" data-action="close" aria-label="关闭">×</button><span class="eyebrow">SCOUTING · ${DIFFICULTIES[g.difficulty].name}</span><h2>${p.name} <small>${p.hp > 0 ? "仍在战场" : "已淘汰"}</small></h2><div class="scout-stats"><span>生命 <b>${p.hp}</b></span><span>金币 <b>${p.gold}</b></span><span>等级 <b>${p.level}</b></span><span>部署 <b>${onboard.length}/${p.level}</b></span></div><p><b>${profile.name}</b> · ${profile.description}</p><p class="micro">当前部署视角 · AI 会在下次开战前调整阵容，侦察不会触发购买或刷新。</p><div class="scout-board">${Array.from(
    { length: 32 },
    (_, i) => {
      const piece = onboard.find((x) => x.position === 32 + i);
      return `<div class="scout-cell">${piece ? `<img src="/assets/units/${unitSprite(piece.defId, g.combatVersion)}.png" alt="${UNIT[piece.defId].name}"><small>${"★".repeat(piece.star)}</small>` : ""}</div>`;
    },
  ).join("")}</div><div class="scout-traits">${
    traits
      .filter((s) => s.active)
      .map((s) => `<span>${s.trait} ${s.count} · ${s.description}</span>`)
      .join("") || "尚无激活羁绊"
  }</div><div class="scout-units">${onboard.map((piece) => `<p><b>${UNIT[piece.defId].name} ${"★".repeat(piece.star)}</b><span>${(piece.items ?? []).map((id) => ITEM[id].name).join(" / ") || "未装备"}</span></p>`).join("") || '<p class="empty">尚未部署棋子。</p>'}</div><p class="micro">备战 ${p.pieces.length - onboard.length} 枚 · 装备库存 ${p.inventory.length} 件</p></section></div>`;
}
