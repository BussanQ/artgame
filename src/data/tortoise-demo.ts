import type {Piece} from "../engine/types";
/** Two small illustrations, not equal-budget balance benchmarks. */
export const TORTOISE_SHELL_DEMO:{left:Piece[];right:Piece[]}={
  left:[{uid:101,defId:"turtle",star:2,position:35,items:["staff","staff","staff"]},
    {uid:102,defId:"infantry",star:2,position:44,items:["blade"]}],
  right:[{uid:201,defId:"guard",star:2,position:35,items:["heart"]},
    {uid:202,defId:"infantry",star:2,position:44,items:["blade"]},
    {uid:203,defId:"flametrooper",star:1,position:42}],
};
export const TORTOISE_BREACH_DEMO:{left:Piece[];right:Piece[]}={
  left:[{uid:101,defId:"turtle",star:2,position:35,items:["staff","staff","staff"]},
    {uid:102,defId:"guard",star:1,position:36,items:["heart"]},
    {uid:103,defId:"infantry",star:1,position:44}],
  right:[{uid:201,defId:"guard",star:2,position:35,items:["heart"]},
    {uid:202,defId:"guard",star:2,position:36,items:["heart"]}],
};
