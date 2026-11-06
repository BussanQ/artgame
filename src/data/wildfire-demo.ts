import type { Piece } from "../engine/types";
/** A small normal-engine scene for flame, breakable egg and rebirth; no campaign state. */
export const WILDFIRE_DEMO: {left:Piece[];right:Piece[]} = {
  left: [
    {uid:101,defId:"phoenix",star:2,position:35,items:["crystal"]},
    {uid:102,defId:"guard",star:1,position:37},
    {uid:103,defId:"phoenix",star:1,position:53},
  ],
  right: [
    {uid:201,defId:"guard",star:3,position:35},
    {uid:202,defId:"guard",star:2,position:37},
    {uid:203,defId:"phoenix",star:3,position:53},
  ],
};
