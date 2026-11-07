import type { Piece } from "../engine/types";

/** Six historical assassin members with legal stars/gear, no scripted critical hits or winner. */
export const ASSASSIN_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    {
      uid: 101,
      defId: "pangolin",
      star: 2,
      position: 43,
      items: ["staff", "staff", "heart"],
    },
    { uid: 102, defId: "axethrall", star: 2, position: 42 },
    { uid: 103, defId: "panda", star: 2, position: 44 },
    { uid: 104, defId: "lingjiu", star: 2, position: 51, items: ["heart"] },
    { uid: 105, defId: "ghostjet", star: 2, position: 50 },
    { uid: 106, defId: "ironrooster", star: 2, position: 52 },
    {
      uid: 107,
      defId: "guard",
      star: 3,
      position: 35,
      items: ["fortress", "plate"],
    },
    { uid: 108, defId: "venombeast", star: 2, position: 36 },
  ],
  right: [
    {
      uid: 201,
      defId: "guard",
      star: 3,
      position: 35,
      items: ["fortress", "plate"],
    },
    { uid: 202, defId: "ironape", star: 2, position: 36 },
    { uid: 203, defId: "elephant", star: 2, position: 34 },
    { uid: 204, defId: "flametrooper", star: 2, position: 37 },
    { uid: 205, defId: "specialist", star: 2, position: 52, items: ["heart"] },
    { uid: 206, defId: "infantry", star: 2, position: 43 },
    { uid: 207, defId: "grenadier", star: 2, position: 44 },
    { uid: 208, defId: "medic", star: 2, position: 51, items: ["staff"] },
  ],
};
