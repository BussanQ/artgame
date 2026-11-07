import type {Piece} from "../engine/types";

/** Same legal two-versus-three formation as the pre-0.79 compatibility fixture. */
export const DREAM_DEMO:{left:Piece[];right:Piece[]}={
  left:[{defId:"spider",uid:101,star:2,position:44,items:["staff"]},{defId:"guard",uid:102,star:2,position:35}],
  right:[{defId:"infantry",uid:201,star:2,position:20},{defId:"guard",uid:202,star:2,position:27},{defId:"repair",uid:203,star:2,position:19}],
};
