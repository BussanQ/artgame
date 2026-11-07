import type { Piece } from "../engine/types";
/** One normal-engine small scene; no campaign state or balance claim. */
export const BONEBLAST_DEMO:{left:Piece[];right:Piece[]}={
  left:[
    {uid:101,defId:"bonedragon",star:2,position:43,items:["crystal","staff"]},
    {uid:102,defId:"vine",star:2,position:35},
    {uid:103,defId:"guard",star:2,position:36},
  ],
  right:[
    {uid:201,defId:"guard",star:2,position:35},
    {uid:202,defId:"infantry",star:2,position:43},
    {uid:203,defId:"phoenix",star:2,position:51},
  ],
};
