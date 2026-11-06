import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { compute } from "../src/compute/job";
import { deployLineup, tacticalOpponent, tacticalScore } from "../src/engine/ai";
import { applyRecommendedDeployment } from "../src/engine/deployment";
import { validGame } from "../src/engine/persistence";
import { RULES } from "../src/data/units";

const paths = process.argv.slice(2);
if (!paths.length) paths.push("tests/fixtures/scouted-control-reserve.json");
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const samples = 7;
const cases = paths.map((path) => {
  const raw = readFileSync(path, "utf8"), input = JSON.parse(raw).game as unknown;
  if (!validGame(input) || input.phase !== "prepare" || input.players[0].hp <= 0)
    throw new Error(`Invalid preparation capture: ${path}`);
  const before = JSON.stringify(input), player = input.players[0];
  const opponent = tacticalOpponent(input, player);
  const staticPlayer = structuredClone(player);
  deployLineup(staticPlayer, input.difficulty === "relaxed" ? "standard" : input.difficulty, "spread", input.combatVersion);
  const staticScore = tacticalScore(staticPlayer.pieces, opponent, input.combatVersion);
  const currentScore = tacticalScore(player.pieces, opponent, input.combatVersion);
  const run = () => {
    const reply = compute({ kind: "deploy", game: input });
    if (reply.kind !== "deployment") throw new Error("Wrong compute result");
    return reply;
  };
  run(); // Warm each real position once; no timing of cold module loading.
  const milliseconds: number[] = [];
  let reply: ReturnType<typeof run>;
  for (let i = 0; i < samples; i++) {
    const started = performance.now();
    reply = run();
    milliseconds.push(performance.now() - started);
  }
  if (JSON.stringify(input) !== before) throw new Error("Compute mutated input");
  const applied = structuredClone(input);
  if (!applyRecommendedDeployment(applied, reply!.positions) || !validGame(applied))
    throw new Error("Invalid deployment result");
  const score = tacticalScore(applied.players[0].pieces, opponent, input.combatVersion);
  if (score + 1e-9 < Math.max(staticScore, currentScore)) throw new Error("Lost an available baseline");
  const sorted = [...milliseconds].sort((a, b) => a - b);
  return {
    input: { path, sha256: sha(path), jsonBytes: Buffer.byteLength(JSON.stringify(input)),
      round: input.round, level: player.level, owned: player.pieces.length,
      bench: player.pieces.filter(piece => piece.position === null).length,
      history: input.history.length, difficulty: input.difficulty },
    samples: milliseconds, medianMs: sorted[Math.floor(samples / 2)], maximumMs: sorted.at(-1),
    trials: reply!.trials, opponent: reply!.opponent,
    scores: { current: currentScore, static: staticScore, recommended: score },
    inputUnchanged: true, legalPlacement: true,
  };
});
const result = {
  checkedAt: new Date().toISOString(), rules: RULES.version,
  method: "Normal paid-proxy preparation captures. One warmup and seven synchronous compute(deploy) measurements each; includes Game cloning and public planning. Excludes browser Worker startup/transfer, UI drawing and real phone performance. No overlapping benchmark or survey process was running.",
  sources: Object.fromEntries(["src/compute/job.ts", "src/engine/ai.ts", "src/engine/deployment.ts",
    "src/engine/battle.ts", "src/engine/recruitment.ts", "scripts/scouting-performance.ts"].map(path => [path, sha(path)])),
  cases,
};
const output = `docs/analysis/scouting-v${RULES.version.split("-")[1].replace(".", "")}-performance.json`;
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ output, cases: cases.map(c => ({ round: c.input.round, owned: c.input.owned,
  medianMs: c.medianMs, maximumMs: c.maximumMs, trials: c.trials })) }));
