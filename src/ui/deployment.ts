import { unitSprite } from "../data/unit-stats";
import { UNIT } from "../data/units";
import {
  CURRENT_COMBAT_VERSION,
  type CombatVersion,
  type Player,
} from "../engine/types";

/** Keep equipment ownership visible when a formation sends its wearer to reserve. */
export function reserveEquipmentHint(player: Pick<Player, "pieces">): string {
  const carriers = player.pieces.filter(
    (piece) => piece.position === null && piece.items?.length,
  );
  if (!carriers.length) return "";
  const count = carriers.reduce((total, piece) => total + piece.items!.length, 0);
  const owner = carriers.length === 1
    ? UNIT[carriers[0].defId].name
    : `${carriers.length} 枚备战棋子`;
  return ` ${owner}仍携带 ${count} 件装备留在备战席，可在装备工坊调整。`;
}

export function deploymentMarkup(
  player: Player,
  selected: number | null,
  busy: boolean,
  open: boolean,
  version: CombatVersion = CURRENT_COMBAT_VERSION,
): string {
  const chosen = player.pieces.find((piece) => piece.uid === selected);
  const hint = busy
    ? "当前仅可查看阵容。"
    : chosen
      ? `已选 ${UNIT[chosen.defId].name}：点击空位部署，点击已有棋子交换；取消选择后可改选场上棋子。`
      : "点选棋子查看详情与装备，再点落位格部署。";
  return `<div class="deployment-panel"><button data-action="deployment" aria-expanded="${open}" aria-controls="deployment-grid">${open ? "收起布阵格" : "精确布阵"}</button><span>${hint}</span>${
    open
      ? `<div id="deployment-grid" role="grid" aria-label="己方精确布阵" class="deployment-grid">${Array.from(
          { length: 32 },
          (_, index) => {
            const pos = index + 32,
              piece = player.pieces.find((p) => p.position === pos),
              coordinate = `${"ABCDEFGH"[pos % 8]}${Math.floor(pos / 8) + 1}`;
            return `<button role="gridcell" data-cell="${pos}" aria-label="己方 ${Math.floor(pos / 8) + 1}行${(pos % 8) + 1}列${piece ? `，${UNIT[piece.defId].name} ${piece.star} 星` : "，空位"}" aria-selected="${piece?.uid === selected}" ${busy ? "disabled" : ""} class="${piece ? "occupied" : ""}"><small>${coordinate}</small>${piece ? `<img src="/assets/units/${unitSprite(piece.defId, version, piece.star)}.png" alt=""><b>${UNIT[piece.defId].name}</b>` : "<span>＋</span>"}</button>`;
          },
        ).join("")}</div>`
      : ""
  }</div>`;
}
