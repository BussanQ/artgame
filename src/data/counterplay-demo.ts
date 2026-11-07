import type { Piece } from "../engine/types";

/** Six snipers/two cavalry face four psychic/four sea units; normal stars and gear only. */
export const COUNTERPLAY_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    {
      uid: 101,
      defId: "guard",
      star: 3,
      position: 35,
      items: ["fortress", "heart"],
    },
    { uid: 102, defId: "motorcycle", star: 2, position: 36 },
    {
      uid: 103,
      defId: "infantry",
      star: 3,
      position: 50,
      items: ["overdrive"],
    },
    { uid: 104, defId: "sniper", star: 2, position: 51 },
    { uid: 105, defId: "specialist", star: 2, position: 59 },
    { uid: 106, defId: "birdrider", star: 2, position: 49 },
    { uid: 107, defId: "cannon", star: 2, position: 43 },
    { uid: 108, defId: "wasp", star: 2, position: 52 },
  ],
  right: [
    {
      uid: 201,
      defId: "shark",
      star: 3,
      position: 36,
      items: ["fortress", "heart"],
    },
    {
      uid: 202,
      defId: "adept",
      star: 2,
      position: 35,
      items: ["staff", "heart"],
    },
    { uid: 203, defId: "acolyte", star: 2, position: 43 },
    { uid: 204, defId: "stormcaller", star: 2, position: 44 },
    { uid: 205, defId: "thunderlord", star: 2, position: 51 },
    { uid: 206, defId: "lingjiu", star: 2, position: 50, items: ["heart"] },
    { uid: 207, defId: "skycrab", star: 2, position: 34 },
    { uid: 208, defId: "eel", star: 2, position: 52 },
  ],
};
