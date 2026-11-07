import type {Piece} from "../engine/types";
/** One small scene: adjacent inner target and a stationary ranged outer target. */
export const HIVE_DEMO:{left:Piece[];right:Piece[]}={
  left:[{uid:101,defId:"wasp",star:2,position:35,items:["staff","staff","crystal"]},
    {uid:102,defId:"guard",star:2,position:36,items:["heart"]}],
  right:[{uid:201,defId:"guard",star:2,position:36,items:["heart"]},
    {uid:202,defId:"infantry",star:2,position:44,items:["heart"]}],
};
