import type { Piece } from "../engine/types";

/** Normal six-beast lineup; legal stars and equipment, no injected stats or scripted result. */
export const BEAST_FRONTLINE_DEMO: { left: Piece[]; right: Piece[] } = {
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
    { uid: 103, defId: "lion", star: 2, position: 34 },
    { uid: 104, defId: "bloodhawk", star: 2, position: 42 },
    { uid: 105, defId: "wolf", star: 2, position: 43 },
    { uid: 106, defId: "deer", star: 2, position: 51 },
  ],
  right: [
    {
      uid: 201,
      defId: "guard",
      star: 3,
      position: 35,
      items: ["fortress", "plate"],
    },
    { uid: 202, defId: "shieldthrall", star: 2, position: 36 },
    { uid: 203, defId: "ironape", star: 2, position: 34 },
    { uid: 204, defId: "specialist", star: 2, position: 52 },
    { uid: 205, defId: "infantry", star: 2, position: 43 },
    { uid: 206, defId: "medic", star: 2, position: 44 },
  ],
};
