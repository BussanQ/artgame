import type {Piece} from "../engine/types";

/** Equal one-star units already within two cells; a real lethal hit triggers the opposing burst. */
export const DETONATION_DEMO:{left:Piece[];right:Piece[]}={
  left:[
    {uid:101,defId:"blastbug",star:1,position:35},
  ],
  right:[
    {uid:201,defId:"blastbug",star:1,position:35},
  ],
};
