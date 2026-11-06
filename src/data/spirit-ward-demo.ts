import type {Piece} from "../engine/types";
/** One small mixed-damage scene, with enough allies to expose simultaneous protection. */
export const SPIRIT_WARD_DEMO:{left:Piece[];right:Piece[]}={
  left:[{uid:101,defId:"deer",star:2,position:43,items:["staff","crystal"]},
    {uid:102,defId:"guard",star:2,position:35,items:["heart"]},
    {uid:103,defId:"infantry",star:2,position:44,items:["heart"]}],
  right:[{uid:201,defId:"infantry",star:2,position:35,items:["blade"]},
    {uid:202,defId:"stormcaller",star:2,position:43,items:["core"]},
    {uid:203,defId:"guard",star:2,position:36,items:["heart"]}],
};
