import type {Piece} from "../engine/types";

/** One fixed support scene; starting energy is supplied by ordinary existing equipment. */
export const SUPPORT_ACTIONS_DEMO:{left:Piece[];right:Piece[]}={
 left:[
  {uid:101,defId:"guard",star:2,position:35},
  {uid:102,defId:"medic",star:2,position:44,items:["staff","crystal"]},
  {uid:103,defId:"deer",star:2,position:43,items:["staff","staff","crystal"]},
 ],
 right:[{uid:201,defId:"ghostjet",star:3,position:35,items:["staff","staff","sage"]}],
};
