import type { Piece } from "../engine/types";
/** A readable two-stage control showcase, not an equal-budget or normal-economy match. */
export const JUNGLE_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    { uid:101,defId:"treant",star:3,position:35,items:["staff"] },
    { uid:102,defId:"treant",star:2,position:37,items:["crystal"] },
    { uid:103,defId:"vine",star:2,position:34 },
    { uid:104,defId:"bonedragon",star:2,position:43 },
    { uid:105,defId:"acolyte",star:2,position:52 },
    { uid:106,defId:"medic",star:2,position:51 },
  ],
  right: [
    { uid:201,defId:"guard",star:3,position:35 },
    { uid:202,defId:"shieldthrall",star:2,position:36 },
    { uid:203,defId:"swordthrall",star:2,position:43 },
    { uid:204,defId:"stormcaller",star:2,position:59 },
    { uid:205,defId:"medic",star:2,position:51 },
    { uid:206,defId:"fish",star:2,position:54 },
  ],
};
