import type { Piece } from "../engine/types";

/** Legal six-versus-six equipment lineups; no scripted buffs or prescribed winner. */
export const STAFFTHRALL_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    {
      uid: 101,
      defId: "staffthrall",
      star: 3,
      position: 35,
      items: ["fortress", "heart", "overdrive"],
    },
    { uid: 102, defId: "shieldthrall", star: 2, position: 36 },
    { uid: 103, defId: "swordthrall", star: 2, position: 34 },
    { uid: 104, defId: "bladethrall", star: 2, position: 42 },
    { uid: 105, defId: "adept", star: 2, position: 50 },
    { uid: 106, defId: "deer", star: 2, position: 43 },
  ],
  right: [
    {
      uid: 201,
      defId: "guard",
      star: 3,
      position: 36,
      items: ["fortress", "heart", "plate"],
    },
    { uid: 202, defId: "ironape", star: 2, position: 35 },
    { uid: 203, defId: "turtle", star: 2, position: 34 },
    { uid: 204, defId: "specialist", star: 2, position: 52 },
    { uid: 205, defId: "grenadier", star: 2, position: 43 },
    { uid: 206, defId: "medic", star: 2, position: 44 },
  ],
};
