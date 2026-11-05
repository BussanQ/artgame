import type { Piece } from "../engine/types";

/** Six beasts and six vanguards in eight legal slots; ordinary stars and gear only. */
export const WILDFRONT_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    {
      uid: 101,
      defId: "elephant",
      star: 2,
      position: 35,
      items: ["fortress", "plate"],
    },
    {
      uid: 102,
      defId: "venombeast",
      star: 2,
      position: 36,
      items: ["staff", "heart"],
    },
    { uid: 103, defId: "bull", star: 2, position: 34 },
    { uid: 104, defId: "bladethrall", star: 2, position: 37 },
    { uid: 105, defId: "swordthrall", star: 2, position: 33 },
    { uid: 106, defId: "bloodhawk", star: 2, position: 42 },
    { uid: 107, defId: "wolf", star: 2, position: 43, items: ["staff"] },
    { uid: 108, defId: "deer", star: 2, position: 51, items: ["staff"] },
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
    { uid: 203, defId: "irondog", star: 2, position: 34 },
    { uid: 204, defId: "flametrooper", star: 2, position: 37 },
    { uid: 205, defId: "specialist", star: 2, position: 52 },
    { uid: 206, defId: "infantry", star: 2, position: 43 },
    { uid: 207, defId: "grenadier", star: 2, position: 44 },
    { uid: 208, defId: "medic", star: 2, position: 51, items: ["staff"] },
  ],
};
