import type {Piece} from "../engine/types";
/** A normal-engine small scene for segmented drain and immortal synergy, without campaign resources. */
export const THORNBIND_DEMO:{left:Piece[];right:Piece[]}={
  left:[
    {uid:101,defId:"vine",star:2,position:35,items:["crystal","heart"]},
    {uid:102,defId:"bonedragon",star:1,position:43},
  ],
  right:[
    {uid:201,defId:"guard",star:2,position:35},
    {uid:202,defId:"infantry",star:2,position:43},
  ],
};
