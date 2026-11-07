import type {Piece} from "../engine/types";
/** One compact encounter: hidden carry, allied repair and an enemy area attacker. */
export const FORMLESS_DEMO:{left:Piece[];right:Piece[]}={
 left:[{uid:101,defId:"ghostjet",star:2,position:43,items:["crystal","crystal","blade"]},{uid:102,defId:"repair",star:2,position:51,items:["crystal","crystal","crystal"]}],
 right:[{uid:201,defId:"guard",star:2,position:35},{uid:202,defId:"flametrooper",star:2,position:36,items:["coil","coil"]}],
};
