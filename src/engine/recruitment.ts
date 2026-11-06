import { catalogCost, catalogVersion } from "../data/catalog";
import { isRecruitable } from "./rotation";
import { RULES, UNIT } from "../data/units";
import { isInsect, mergePieces, pieceCopies, salePrice } from "./progression";
import type { Game, Piece, Player } from "./types";

/** Shared, read-only sale quote for real transactions and concrete reserve swaps. */
export function previewSale(
  game:Pick<Game,"phase"|"combatVersion"|"catalogVersion">,
  player:Player,
  uid:number,
) {
  if(game.phase!=="prepare")return null;
  const piece=player.pieces.find(piece=>piece.uid===uid);
  if(!piece)return null;
  const after=structuredClone(player),price=salePrice(piece,catalogVersion(game));
  after.gold+=price;
  after.inventory.push(...(piece.items??[]));
  after.pieces=after.pieces.filter(piece=>piece.uid!==uid);
  return {after,price,defId:piece.defId,copies:pieceCopies(piece)};
}

export interface PurchasePreview {
  allowed: boolean;
  reason: string;
  cost: number;
  after: Player | null;
  upgrades: Piece[];
  benchAfter: number;
  interestBefore: number;
  interestAfter: number;
}

/** Read-only projection shared by the shop and the actual purchase transaction. */
export function previewPurchase(
  game: Pick<
    Game,
    "phase" | "nextUid" | "combatVersion" | "bannedSeries" | "catalogVersion"
  >,
  player: Player,
  index: number,
): PurchasePreview {
  const id = player.shop[index];
  const cost = id && UNIT[id] ? catalogCost(game, id) : 0;
  const interest = (gold: number) =>
    Math.min(5, Math.floor(Math.max(0, gold) / 10));
  const result: PurchasePreview = {
    allowed: false,
    reason: "该位置已招募",
    cost,
    after: null,
    upgrades: [],
    benchAfter: player.pieces.filter((p) => p.position === null).length,
    interestBefore: interest(player.gold),
    interestAfter: interest(player.gold - cost),
  };
  if (!id || !UNIT[id]) return result;
  if (!isRecruitable(game, id)) {
    result.reason = "本局已禁用该系列";
    return result;
  }
  const after = structuredClone(player);
  after.pieces.push({
    uid: game.nextUid,
    defId: id,
    star: 1,
    position: null,
    ...(isInsect(id) ? { copies: 1 } : {}),
  });
  mergePieces(after, game.combatVersion);
  after.gold -= cost;
  after.shop[index] = null;
  result.after = after;
  result.benchAfter = after.pieces.filter((p) => p.position === null).length;
  const stars = new Map(player.pieces.map((p) => [p.uid, p.star]));
  result.upgrades = after.pieces.filter(
    (p) => p.star > (stars.get(p.uid) ?? 1),
  );
  result.reason =
    game.phase !== "prepare"
      ? "准备阶段可招募"
      : player.gold < cost
        ? `还差 ${cost - player.gold} 金`
        : result.benchAfter > RULES.bench
          ? "备战席已满，需先部署或出售"
          : "";
  result.allowed = !result.reason;
  return result;
}
