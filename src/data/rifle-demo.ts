import type {Piece} from "../engine/types";
/** One normal-engine small scene to compare three passive rifle rates, not an economic balance sample. */
export const RIFLE_DEMO:{left:Piece[];right:Piece[]}={
  left:[
    {uid:101,defId:"infantry",star:1,position:42},
    {uid:102,defId:"infantry",star:2,position:44},
    {uid:103,defId:"infantry",star:3,position:46},
    {uid:104,defId:"guard",star:2,position:36},
  ],
  right:[
    {uid:201,defId:"guard",star:3,position:35,items:["heart"]},
    {uid:202,defId:"shieldthrall",star:2,position:36,items:["heart"]},
  ],
};
