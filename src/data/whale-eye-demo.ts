import type { Piece } from "../engine/types";

export const WHALE_EYE_DEMO: {left:Piece[];right:Piece[]} = {
  left:[
    {uid:101,defId:"stormcaller",star:2,position:59,items:["whale-eye"]},
    {uid:102,defId:"guard",star:3,position:35,items:["heart"]},
  ],
  right:[
    {uid:201,defId:"guard",star:3,position:35,items:["heart"]},
    {uid:202,defId:"ghostjet",star:2,position:59,items:["staff"]},
    {uid:203,defId:"repair",star:2,position:61,items:["staff"]},
  ],
};
