import type { Piece } from "../engine/types";
/** Maintained spell showcase through normal combat, not an equal-budget encounter. */
export const SECRET_ORB_DEMO:{left:Piece[];right:Piece[]}={
  left:[
    {uid:101,defId:"master",star:2,position:35,items:["plate"]},
    {uid:102,defId:"elephant",star:2,position:36},
    {uid:103,defId:"panda",star:2,position:44,items:["crystal"]},
    {uid:104,defId:"monk",star:2,position:43,items:["crystal"]},
    {uid:105,defId:"medic",star:2,position:51},
    {uid:106,defId:"infantry",star:2,position:52},
  ],
  right:[
    {uid:201,defId:"guard",star:3,position:35},
    {uid:202,defId:"guard",star:2,position:36},
    {uid:203,defId:"vine",star:2,position:34},
    {uid:204,defId:"infantry",star:2,position:43},
    {uid:205,defId:"stormcaller",star:2,position:44},
    {uid:206,defId:"medic",star:2,position:51},
  ],
};
/** One defensive unit changes: its silence provides real channel counterplay. */
export const SECRET_ORB_COUNTER_DEMO = structuredClone(SECRET_ORB_DEMO);
SECRET_ORB_COUNTER_DEMO.right.find(piece=>piece.uid===202)!.defId="shieldthrall";
