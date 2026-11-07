import type { Piece } from "../engine/types";
/** One normal-engine six-on-six demonstration, without campaign resources or a balance claim. */
export const TORNADO_DEMO:{left:Piece[];right:Piece[]}={
  left:[
    {uid:101,defId:"guard",star:2,position:35,items:["plate"]},
    {uid:102,defId:"guard",star:2,position:36},
    {uid:103,defId:"winddragon",star:2,position:51,items:["staff","crystal"]},
    {uid:104,defId:"infantry",star:2,position:43},
    {uid:105,defId:"medic",star:2,position:52},
    {uid:106,defId:"acolyte",star:2,position:50},
  ],
  right:[
    {uid:201,defId:"guard",star:2,position:35},
    {uid:202,defId:"guard",star:2,position:36},
    {uid:203,defId:"vine",star:2,position:34},
    {uid:204,defId:"infantry",star:2,position:43},
    {uid:205,defId:"cannon",star:2,position:44},
    {uid:206,defId:"medic",star:2,position:51},
  ],
};
