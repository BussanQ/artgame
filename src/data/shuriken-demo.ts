import type { Piece } from "../engine/types";

/** Unequal-budget skill showcase; all effects still use the ordinary combat engine. */
export const SHURIKEN_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    { uid:101,defId:"master",star:2,position:35,items:["plate"] },
    { uid:102,defId:"elephant",star:2,position:36 },
    { uid:103,defId:"panda",star:2,position:43,items:["crystal","coil"] },
    { uid:104,defId:"monk",star:2,position:51 },
    { uid:105,defId:"medic",star:1,position:52 },
    { uid:106,defId:"infantry",star:2,position:56 },
  ],
  right: [
    { uid:201,defId:"guard",star:2,position:35 },
    { uid:202,defId:"swordthrall",star:2,position:36 },
    { uid:203,defId:"vine",star:2,position:34 },
    { uid:204,defId:"infantry",star:2,position:43 },
    { uid:205,defId:"stormcaller",star:2,position:44 },
    { uid:206,defId:"medic",star:1,position:51 },
  ],
};
