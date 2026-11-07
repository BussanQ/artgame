import type { Piece } from "../engine/types";

/** A normal six-on-six formation; no scripted casts or hidden stat bonuses. */
export const SHIELDTHRALL_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    { uid: 101, defId: "shieldthrall", star: 2, position: 35 },
    { uid: 102, defId: "swordthrall", star: 2, position: 36 },
    { uid: 103, defId: "bladethrall", star: 2, position: 42 },
    { uid: 104, defId: "axethrall", star: 2, position: 58 },
    { uid: 105, defId: "adept", star: 2, position: 50 },
    { uid: 106, defId: "shark", star: 1, position: 34 },
  ],
  right: [
    { uid: 201, defId: "guard", star: 2, position: 36 },
    { uid: 202, defId: "ironape", star: 2, position: 35 },
    { uid: 203, defId: "specialist", star: 2, position: 52 },
    { uid: 204, defId: "grenadier", star: 2, position: 43 },
    { uid: 205, defId: "infantry", star: 2, position: 45 },
    { uid: 206, defId: "medic", star: 2, position: 44 },
  ],
};
