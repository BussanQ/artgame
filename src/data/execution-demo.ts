import type {Piece} from "../engine/types";
/** Small illustrative encounter, not an equal-budget balance benchmark. */
export const EXECUTION_DEMO:{left:Piece[];right:Piece[]}={
 left:[{uid:101,defId:"reaper",star:2,position:35,items:["heart","blade","coil"]},
  {uid:102,defId:"infantry",star:1,position:44}],
 right:[{uid:201,defId:"guard",star:1,position:35},
  {uid:202,defId:"elephant",star:2,position:36,items:["heart"]},
  {uid:203,defId:"acolyte",star:1,position:44}],
};
