import type {Piece} from "../engine/types";
/** A nearby attacker first chooses the lower-uid backline, then a shield stance redirects it. */
export const BULWARK_DEMO:{left:Piece[];right:Piece[]}={
  left:[{uid:101,defId:"infantry",star:2,position:43,items:["heart"]},
    {uid:102,defId:"guard",star:2,position:36,items:["crystal","crystal"]}],
  right:[{uid:201,defId:"guard",star:2,position:35,items:["heart"]},
    {uid:202,defId:"flametrooper",star:2,position:28}],
};
