import type { Piece } from "../engine/types";

/** Six abnormal units sustain a physical carry and wolf summons; no special combat stats. */
export const ABNORMAL_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    {
      uid: 101,
      defId: "vine",
      star: 3,
      position: 35,
      items: ["fortress", "heart"],
    },
    { uid: 102, defId: "monk", star: 2, position: 36, items: ["plate"] },
    { uid: 103, defId: "eyebug", star: 2, position: 34, items: ["heart"] },
    { uid: 104, defId: "spider", star: 2, position: 43, items: ["heart"] },
    { uid: 105, defId: "eel", star: 2, position: 52, items: ["staff"] },
    { uid: 106, defId: "grenadier", star: 2, position: 51 },
    { uid: 107, defId: "wolf", star: 2, position: 44, items: ["staff"] },
    {
      uid: 108,
      defId: "wasp",
      star: 3,
      position: 59,
      items: ["overdrive", "bloodblade"],
    },
  ],
  right: [
    {
      uid: 201,
      defId: "staffthrall",
      star: 3,
      position: 35,
      items: ["fortress", "plate"],
    },
    { uid: 202, defId: "shieldthrall", star: 2, position: 36 },
    { uid: 203, defId: "swordthrall", star: 2, position: 34 },
    {
      uid: 204,
      defId: "infantry",
      star: 3,
      position: 51,
      items: ["overdrive"],
    },
    { uid: 205, defId: "cannon", star: 2, position: 52 },
    { uid: 206, defId: "repair", star: 2, position: 59, items: ["staff"] },
    { uid: 207, defId: "elephant", star: 2, position: 37 },
    { uid: 208, defId: "venombeast", star: 2, position: 43 },
  ],
};
