import { UNIT } from "../data/units";
import type { Player } from "../engine/types";
export function deploymentMarkup(
  player: Player,
  selected: number | null,
  busy: boolean,
  open: boolean,
): string {
  return `<div class="deployment-panel"><button data-action="deployment" aria-expanded="${open}" aria-controls="deployment-grid">${open ? "收起布阵格" : "精确布阵"}</button><span>点选棋子，再点落位格；已有棋子可交换。</span>${
    open
      ? `<div id="deployment-grid" role="grid" aria-label="己方精确布阵" class="deployment-grid">${Array.from(
          { length: 32 },
          (_, index) => {
            const pos = index + 32,
              piece = player.pieces.find((p) => p.position === pos),
              coordinate = `${"ABCDEFGH"[pos % 8]}${Math.floor(pos / 8) + 1}`;
            return `<button role="gridcell" data-cell="${pos}" aria-label="己方 ${Math.floor(pos / 8) + 1}行${(pos % 8) + 1}列${piece ? `，${UNIT[piece.defId].name} ${piece.star} 星` : "，空位"}" aria-selected="${piece?.uid === selected}" ${busy ? "disabled" : ""} class="${piece ? "occupied" : ""}"><small>${coordinate}</small>${piece ? `<img src="/assets/units/${piece.defId}.png" alt=""><b>${UNIT[piece.defId].name}</b>` : "<span>＋</span>"}</button>`;
          },
        ).join("")}</div>`
      : ""
  }</div>`;
}
