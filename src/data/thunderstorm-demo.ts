import type { Piece } from "../engine/types";
/** Line control against clustered and split enemies; a visual scenario, not an equal-budget match. */
export const THUNDERSTORM_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    { uid:101,defId:"stormcaller",star:3,position:59,items:["staff"] },
    { uid:102,defId:"stormcaller",star:2,position:61,items:["crystal"] },
    { uid:103,defId:"acolyte",star:2,position:52 },
    { uid:104,defId:"titan",star:2,position:35 },
    { uid:105,defId:"guard",star:3,position:36 },
    { uid:106,defId:"medic",star:2,position:51 },
  ],
  right: [
    { uid:201,defId:"guard",star:3,position:35 },
    { uid:202,defId:"ironape",star:2,position:36 },
    { uid:203,defId:"stormcaller",star:2,position:43 },
    { uid:204,defId:"arhat",star:2,position:51 },
    { uid:205,defId:"medic",star:2,position:59 },
    { uid:206,defId:"spider",star:2,position:61 },
  ],
};
