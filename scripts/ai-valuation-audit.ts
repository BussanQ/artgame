import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { UNITS } from "../src/data/units";
import { pieceStrength } from "../src/engine/ai";
const label = process.argv[2] ?? "current";
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid report label");
const paths = [
  "src/engine/ai.ts",
  "src/data/units.ts",
  "src/data/skills.ts",
  "src/data/items.ts",
];
const sources = Object.fromEntries(
  paths.map((p) => [
    p,
    createHash("sha256").update(readFileSync(p)).digest("hex"),
  ]),
);
const rows = UNITS.flatMap((u) =>
  [1, 2, 3].map((star) => {
    const p = { uid: 1, defId: u.id, star, position: 35 };
    return {
      id: u.id,
      name: u.name,
      cost: u.cost,
      star,
      base: pieceStrength(p),
      staff: pieceStrength({ ...p, items: ["staff"] }),
      blade: pieceStrength({ ...p, items: ["blade"] }),
    };
  }),
);
writeFileSync(
  "docs/analysis/ai-valuation-" + label + ".json",
  JSON.stringify({ label, sources, rows }, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    label,
    rows: rows.length,
    staffIgnored: rows.filter((r) => r.staff === r.base).length,
  }),
);
