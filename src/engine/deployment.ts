import type { Game, Piece } from "./types";
import { RULES } from "../data/units";

export type PiecePosition = Pick<Piece,"uid"|"position">;

/** Commit a complete placement atomically; ownership, items and economy stay on
 * the caller's current game, never in a returned worker copy. */
export function applyRecommendedDeployment(game:Game,positions:readonly PiecePosition[]) {
  const player=game.players[0];
  if(game.phase!=="prepare"||game.reward||player.hp<=0||positions.length!==player.pieces.length)return false;
  const proposed=new Map(positions.map(piece=>[piece.uid,piece.position]));
  if(proposed.size!==player.pieces.length||player.pieces.some(piece=>!proposed.has(piece.uid)))return false;
  const occupied:number[]=[];
  for(const {position}of positions){
    if(position===null)continue;
    if(!Number.isInteger(position)||position<32||position>=64)return false;
    occupied.push(position);
  }
  if(new Set(occupied).size!==occupied.length||occupied.length>player.level||
    player.pieces.length-occupied.length>RULES.bench||(player.pieces.length>0&&!occupied.length))return false;
  for(const piece of player.pieces)piece.position=proposed.get(piece.uid)!;
  return true;
}
