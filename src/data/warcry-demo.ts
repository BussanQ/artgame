import type { Piece } from "../engine/types";
/** One small normal-engine demonstration, not a balance sample. */
export const WARCRY_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    {uid:101,defId:"lion",star:2,position:35,items:["plate","crystal"]},
    {uid:102,defId:"guard",star:2,position:34},
    {uid:103,defId:"elephant",star:2,position:36},
    {uid:104,defId:"infantry",star:2,position:43},
    {uid:105,defId:"medic",star:2,position:51},
    {uid:106,defId:"titan",star:1,position:52},
  ],
  right: [
    {uid:201,defId:"guard",star:2,position:35},
    {uid:202,defId:"guard",star:2,position:36},
    {uid:203,defId:"vine",star:2,position:34},
    {uid:204,defId:"infantry",star:2,position:43},
    {uid:205,defId:"stormcaller",star:2,position:44},
    {uid:206,defId:"medic",star:2,position:51},
  ],
};
