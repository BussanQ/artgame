import type { Piece } from "../engine/types";

/** Nine legal slots: four air/four raptors face four supports/three summoners. */
export const COALITION_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    { uid: 101, defId: "bomber", star: 2, position: 35, items: ["plate"] },
    { uid: 102, defId: "bloodhawk", star: 3, position: 36, items: ["heart"] },
    {
      uid: 103,
      defId: "bonedragon",
      star: 3,
      position: 34,
      items: ["fortress", "plate"],
    },
    {
      uid: 104,
      defId: "ghostjet",
      star: 2,
      position: 51,
      items: ["bloodblade"],
    },
    { uid: 105, defId: "bat", star: 2, position: 50, items: ["overdrive"] },
    { uid: 106, defId: "winddragon", star: 2, position: 52 },
    { uid: 107, defId: "repair", star: 2, position: 59, items: ["staff"] },
    { uid: 108, defId: "ark", star: 2, position: 58, items: ["staff"] },
    { uid: 109, defId: "skytoad", star: 2, position: 37, items: ["heart"] },
  ],
  right: [
    {
      uid: 201,
      defId: "shark",
      star: 3,
      position: 35,
      items: ["fortress", "heart"],
    },
    {
      uid: 202,
      defId: "staffthrall",
      star: 3,
      position: 36,
      items: ["plate", "heart"],
    },
    { uid: 203, defId: "wolf", star: 2, position: 34, items: ["staff"] },
    { uid: 204, defId: "adept", star: 2, position: 43, items: ["staff"] },
    { uid: 205, defId: "medic", star: 2, position: 51, items: ["staff"] },
    { uid: 206, defId: "acolyte", star: 2, position: 52, items: ["crystal"] },
    { uid: 207, defId: "deer", star: 2, position: 50 },
    { uid: 208, defId: "repair", star: 2, position: 59 },
    { uid: 209, defId: "skycrab", star: 2, position: 37, items: ["heart"] },
  ],
};
