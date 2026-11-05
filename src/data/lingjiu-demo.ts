import type { Piece } from "../engine/types";

/** Normal sea/assassin/air formation, without injected stats or a prescribed outcome. */
export const LINGJIU_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    {
      uid: 101,
      defId: "lingjiu",
      star: 2,
      position: 43,
      items: ["staff", "staff", "heart"],
    },
    { uid: 102, defId: "ghostjet", star: 2, position: 37 },
    { uid: 103, defId: "axethrall", star: 2, position: 34 },
    { uid: 104, defId: "skycrab", star: 2, position: 35 },
    { uid: 105, defId: "fish", star: 2, position: 44 },
    { uid: 106, defId: "repair", star: 2, position: 52 },
  ],
  right: [
    {
      uid: 201,
      defId: "guard",
      star: 3,
      position: 35,
      items: ["fortress", "heart", "plate"],
    },
    { uid: 202, defId: "venombeast", star: 2, position: 36 },
    { uid: 203, defId: "ironape", star: 2, position: 34 },
    { uid: 204, defId: "specialist", star: 2, position: 52 },
    { uid: 205, defId: "grenadier", star: 2, position: 44 },
    { uid: 206, defId: "medic", star: 2, position: 43 },
  ],
};
