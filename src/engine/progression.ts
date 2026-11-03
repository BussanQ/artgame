import { UNIT, UNITS } from "../data/units";
import type { CombatVersion, Piece, Player } from "./types";
export const isInsect = (id: string) =>
  UNIT[id]?.traits.includes("异虫") ?? false;
export const insectCount = (pieces: Piece[]) =>
  new Set(pieces.filter((p) => isInsect(p.defId)).map((p) => p.defId)).size;
export const pieceCopies = (piece: Piece) =>
  piece.copies ?? 3 ** (piece.star - 1);
export const salePrice = (piece: Piece) =>
  isInsect(piece.defId)
    ? Math.min(5, UNIT[piece.defId].cost * 3 ** (piece.star - 1))
    : UNIT[piece.defId].cost * pieceCopies(piece);
export function mergeCount(
  pieces: Piece[],
  id: string,
  star: number,
  version: CombatVersion = "metamorph",
) {
  if (
    (version !== "brood" &&
      version !== "airsea" &&
      version !== "fleet" &&
      version !== "metamorph") ||
    !isInsect(id)
  )
    return 3;
  const kinds = insectCount(pieces);
  return kinds >= (star === 1 ? 2 : 4) ? 2 : 3;
}
/** Evolution records real pool copies; equipment overflow returns to inventory. */
export function mergePieces(p: Player, version: CombatVersion = "metamorph") {
  for (const d of UNITS)
    for (let star = 1; star < 3; star++) {
      for (;;) {
        const count = mergeCount(p.pieces, d.id, star, version);
        const same = p.pieces
          .filter((x) => x.defId === d.id && x.star === star)
          .sort(
            (a, b) =>
              Number(a.position === null) - Number(b.position === null) ||
              a.uid - b.uid,
          );
        if (same.length < count) break;
        const used = same.slice(0, count),
          kept = used[0];
        const copies = used.reduce((n, piece) => n + pieceCopies(piece), 0);
        const equipment = used.flatMap((x) => x.items ?? []);
        kept.star++;
        if (isInsect(d.id)) kept.copies = copies;
        kept.items = equipment.slice(0, 3);
        p.inventory.push(...equipment.slice(3));
        const removed = new Set(used.slice(1).map((x) => x.uid));
        p.pieces = p.pieces.filter((x) => !removed.has(x.uid));
      }
    }
}
