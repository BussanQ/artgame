import type { Piece } from "../engine/types";
/** Controlled showcase of physical chains and protection, not an equal-budget balance trial. */
export const LIGHTNING_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    {
      uid: 101,
      defId: "thunderlord",
      star: 3,
      position: 51,
      items: ["bloodblade", "coil"],
    },
    { uid: 102, defId: "thunderlord", star: 2, position: 53 },
    { uid: 103, defId: "guard", star: 3, position: 35 },
    { uid: 104, defId: "panda", star: 3, position: 37 },
    { uid: 105, defId: "repair", star: 2, position: 60 },
    { uid: 106, defId: "birdrider", star: 2, position: 58 },
  ],
  right: [
    { uid: 201, defId: "turtle", star: 3, position: 34 },
    { uid: 202, defId: "guard", star: 3, position: 35 },
    { uid: 203, defId: "lion", star: 3, position: 36 },
    { uid: 204, defId: "deer", star: 2, position: 43 },
    { uid: 205, defId: "sniper", star: 3, position: 51 },
    { uid: 206, defId: "stormcaller", star: 3, position: 53 },
  ],
};
