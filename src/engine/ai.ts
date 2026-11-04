import { unitArmor } from "../data/unit-stats";
import { CURRENT_COMBAT_VERSION } from "./types";
import { isInsect, insectCount, mergeCount, pieceCopies } from "./progression";
import { simulateOutcome } from "./battle";
import { encounterFor, encounterArmy } from "../data/encounters";
import { profileFor, DIFFICULTIES, type AiProfile } from "../data/ai-profiles";
import { AXE_THROW, BLADE_STORM, SKILLS } from "../data/skills";
import { RETINUE, SPIRIT_WOLF } from "./summons";
import { equipmentStats } from "../data/items";
import { UNIT, RULES } from "../data/units";
import { synergies } from "./synergies";
import { equipBot } from "./equipment";
import type { CombatVersion, Difficulty, Game, Piece, Player } from "./types";

const CONTROL_SECONDS: Record<string, number> = {
  axethrall: AXE_THROW.stunTicks / 4,
  irondog: 0.5,
  specialist: 0.75,
  guard: 1,
  cavalry: 0.5,
  bull: 1,
  titan: 1.5,
  eyebug: 1.5,
  bat: 1,
  vine: 1.5,
  bonedragon: 1,
  treant: 2,
  winddragon: 1.5,
};

/** Expected first-cast contribution, deliberately below perfect multi-target uptime.
 * This is a roster heuristic, never an extra combat bonus or a claim of win probability. */
export function abilityCredit(
  p: Piece,
  gear = equipmentStats(p.items),
): number {
  const u = UNIT[p.defId],
    skill = SKILLS[p.defId];
  // Team healing, charging and retinues are already credited separately below.
  if (
    [
      "fish",
      "deer",
      "monk",
      "repair",
      "medic",
      "acolyte",
      "ironrooster",
      "wolf",
      "adept",
      "shark",
    ].includes(p.defId)
  )
    return 0;
  if (p.defId === "birdrider") return 1.2 / (8 - p.star); // Discount interruption; no mana or skill-power gain.
  const passive = ["cavalry", "turtle", "tiger", "blastbug"].includes(p.defId);
  const initial = Math.min(
    100,
    (p.defId === "bomber" ? 50 : (u.initialMana ?? 0)) + gear.mana,
  );
  const readiness = passive ? 1 : 0.65 + initial * 0.0035;
  const power = 1 + gear.skillPower;
  let attacks = skill.multiplier * (skill.radius > 0 ? 1.8 : 1);
  let utility = skill.shieldRatio * 0.25;
  utility +=
    (CONTROL_SECONDS[p.defId] ?? 0) * (skill.radius > 0 ? 1.8 : 1) * 0.035;
  switch (p.defId) {
    case "swordthrall":
      // Three pulses on two targets; do not assume six perfectly packed hits.
      attacks =
        (BLADE_STORM.damage[p.star - 1] * 3 * 2) /
        (u.attack * 2 ** (p.star - 1));
      utility += 0.08;
      break;
    case "axethrall":
      // Historical flat 300/500/700 progression, not per-star doubling.
      attacks = AXE_THROW.damage[p.star - 1] / (u.attack * 2 ** (p.star - 1));
      break;
    case "ironape":
      attacks = (250 * 1.5 * 0.75) / u.attack; // Nearby targets, with an interruption allowance.
      break;
    case "specialist":
      attacks = (300 / u.attack) * 0.75; // Aiming may be interrupted or lose its target.
      break;
    case "irondog":
      attacks = (70 * 2 * 1.5) / u.attack; // Two pulses on 1.5 nearby targets; allow interruption.
      break;
    case "motorcycle":
      attacks = (100 * 2) / u.attack; // Credit two of three shots; allow interruption.
      break;
    case "turtle":
      return 0.12; // Decaying armor ignores mana and skill power.
    case "bloodhawk":
      return 0.22 * readiness; // Heal/form cannot be amplified by skill power.
    case "skytoad":
      return 0.22 * readiness; // HP threshold, once per battle; not amplified damage.
    case "spider":
      return Math.min(0.24, 0.08 + p.star * 0.04) * readiness;
    case "flametrooper":
      attacks = (skill.multiplier + 0.35 * 2) * 1.6;
      break;
    case "grenadier":
      utility += (1 + p.star) * 0.05;
      break;
    case "whale":
      // Credit three pulses on two targets of comparable HP, not ten hits on an entire team.
      attacks = (u.hp * (0.02 + p.star * 0.01) * 3 * 2) / u.attack;
      break;
    case "blastbug":
      attacks = (u.hp * 0.35 * 1.8) / u.attack;
      break;
    case "bomber":
    case "eel":
    case "phoenix":
      attacks = skill.multiplier * 2 * 1.8;
      break; // Interrupted channels/targets walking away.
    case "ark":
      attacks = skill.multiplier * 1.8 * 0.75;
      break;
    case "arhat":
      attacks *= 0.75;
      break;
    case "thunderlord":
      attacks *= 1 + 0.8 + 0.64;
      break;
    case "bat":
      attacks = 0.4 * 3;
      break;
    case "tiger":
      attacks = Math.max(0, attacks - 1);
      break; // Replaces an ordinary attack.
    case "ghostjet":
      utility += 0.08;
      break;
    case "dragonfly":
      utility += 0.07;
      break;
    case "treant":
    case "vajra":
      utility += 0.05;
      break;
  }
  const damageWeight = skill.damageType === "true" ? 1.25 : 1;
  // Keep stars, permanent stats and completed synergies important. Extra gear never
  // turns a one-star specialist into a guaranteed replacement for a developed carry.
  return Math.min(
    0.6,
    (attacks * damageWeight * power * 0.04 + utility) * readiness,
  );
}
/** A bounded estimate for lineup selection; not an official or simulated combat rating. */
export function pieceStrength(p: Piece): number {
  const u = UNIT[p.defId],
    scale = 2 ** (p.star - 1),
    gear = equipmentStats(p.items);
  const summon =
    p.defId === "wolf"
      ? { ...SPIRIT_WOLF, count: 2 }
      : p.defId === "adept"
        ? RETINUE.puppet
        : p.defId === "shark"
          ? RETINUE.sentinel
          : null;
  // Credit part of a successful first summon; do not assume an unlimited army.
  const companion = summon
    ? 0.4 *
      summon.count *
      Math.sqrt((summon.hp * summon.attack) / summon.interval) *
      scale *
      (1 + gear.skillPower)
    : 0;
  return (
    Math.sqrt(
      ((u.hp * scale + gear.hp) * (u.attack * scale + gear.attack)) /
        Math.max(1, u.interval * (1 - gear.haste)),
    ) *
      (1 + (unitArmor(u, p.star) + gear.armor) * 0.025) *
      (p.defId === "phoenix" && p.star >= 2 ? 1.12 : 1) *
      (1 + abilityCredit(p, gear)) +
    companion
  );
}
/** Opening protection for ranged allies, not a mandatory tank slot or win forecast.
 * Jumping assassins leave the line; unactivated flankers only provide partial cover.
 * Use permanent bodies/gear, not summons that still need to be cast and placed. */
export function frontlineFactor(
  pieces: Piece[],
  assassinsJump = false,
): number {
  if (pieces.length < 3) return 1;
  let front = 0,
    back = 0;
  let hasRanged = false;
  for (const p of pieces) {
    const u = UNIT[p.defId],
      gear = equipmentStats(p.items);
    const durability =
      (u.hp * 2 ** (p.star - 1) + gear.hp) *
      (1 + Math.max(0, unitArmor(u, p.star) + gear.armor) * 0.06);
    const assassin = u.traits.includes("刺杀");
    // Bomber is deliberately placed on the front row despite its range of two.
    const frontRole =
      u.range === 1 || ["bomber", "flametrooper"].includes(u.id);
    hasRanged ||= !frontRole;
    if (assassin && assassinsJump) continue;
    if (!frontRole) back += durability;
    else front += durability * (assassin ? 0.35 : 1);
  }
  if (!hasRanged) return 0.94;
  if (!back) return 1;
  // A front body budget of half the ranged body budget gives full credit.
  // Missing protection costs at most the same 18% as the old all-ranged penalty.
  return 0.82 + 0.18 * Math.min(1, front / (back * 0.5));
}
export function lineupScore(pieces: Piece[], profile: AiProfile): number {
  const base = pieces.reduce((n, p) => n + pieceStrength(p), 0);
  const active = synergies(pieces.map((p, i) => ({ ...p, position: 32 + i })));
  const bonus = active.reduce((n, s) => n + s.tier * 0.075, 0);
  // A modest, bounded credit for nearby ally healing. Damage-based self-healing (wolf)
  // is deliberately excluded; it does not heal allies or scale from the caster's HP.
  const support = pieces.reduce((n, p) => {
    if (!["fish", "deer", "monk", "repair", "medic"].includes(p.defId))
      return n;
    const skill = SKILLS[p.defId],
      gear = equipmentStats(p.items);
    const hp = UNIT[p.defId].hp * 2 ** (p.star - 1) + gear.hp;
    if (p.defId === "medic")
      return (
        n +
        Math.min(
          // At most two recipients and three of four pulses; allow skill gear
          // to matter before the cap, while bounding total credit below body value.
          pieceStrength(p) * 0.8,
          (50 + p.star * 25) *
            3 *
            (1 + gear.skillPower) *
            Math.min(2, pieces.length) *
            0.08,
        )
      );
    if (p.defId === "repair") {
      const carry = Math.max(
        0,
        ...pieces.filter((ally) => ally.uid !== p.uid).map(pieceStrength),
      );
      return (
        n +
        carry * ((15 + p.star * 10) / 100) * 0.45 +
        Math.min(
          pieceStrength(p) * 0.25,
          hp * 0.25 * (1 + gear.skillPower) * 0.08,
        )
      );
    }
    const recipients = Math.min(pieces.length, p.defId === "deer" ? 2 : 3);
    return (
      n +
      Math.min(
        pieceStrength(p) * 0.15,
        hp * skill.healRatio * (1 + gear.skillPower) * recipients * 0.08,
      )
    );
  }, 0);
  // Energy support depends on allies that can actually cast. Count only the best
  // battery: duplicate acolytes must not inflate a lineup through mutual charging.
  const battery = pieces
    .filter((p) => p.defId === "acolyte")
    .sort((a, b) => b.star - a.star)[0];
  const energySupport = battery
    ? pieces
        .filter(
          (p) =>
            ![
              "acolyte",
              "cavalry",
              "turtle",
              "tiger",
              "blastbug",
              "birdrider",
            ].includes(p.defId),
        )
        .sort((a, b) => pieceStrength(b) - pieceStrength(a))
        .slice(0, 2)
        .reduce((n, p) => n + pieceStrength(p), 0) *
      ((15 + battery.star * 10) / 100) *
      0.5
    : 0;
  const flyingShare =
    pieces.filter((p) => UNIT[p.defId].flying).length /
    Math.max(1, pieces.length);
  const physicalShare = pieces.length
    ? pieces.filter((p) => !UNIT[p.defId].traits.includes("陆行者")).length /
      pieces.length
    : 0;
  const teamBonus = active.reduce(
    (n, s) =>
      n +
      (s.bonus.evasion ?? 0) * flyingShare * 0.3 +
      (s.bonus.seaMana ?? 0) * flyingShare * 0.0025 +
      (s.bonus.siege ?? 0) * 0.2 +
      (s.bonus.enemyArmor ?? 0) * 0.012 * physicalShare +
      (s.bonus.reflection ?? 0) * 0.002 +
      ((s.bonus.groundBonus ?? 0) * 0.35 * s.count) /
        Math.max(1, pieces.length) +
      (s.bonus.trueAttack ? (0.1 * s.count) / Math.max(1, pieces.length) : 0) +
      ((s.bonus.immortal ?? 0) * 0.007 * s.count) / Math.max(1, pieces.length),
    0,
  );
  const preferred = pieces.reduce(
    (n, p) =>
      n +
      UNIT[p.defId].traits.filter((t) => profile.traits.includes(t)).length * 8,
    0,
  );
  const coordinator = pieces
    .filter((p) => p.defId === "ironrooster")
    .sort((a, b) => b.star - a.star)[0];
  const coordination = coordinator
    ? pieces
        .map(pieceStrength)
        .sort((a, b) => b - a)
        .slice(0, 3)
        .reduce((n, power) => n + power, 0) *
      Math.min(
        0.18,
        (0.05 + coordinator.star * 0.1) * 0.3 +
          (1 + coordinator.star * 2) * 0.012,
      )
    : 0;
  const armorRegen = active.find((s) => s.trait === "装甲")?.bonus.regen ?? 0;
  const sustain = pieces.reduce((value, p) => {
    if (!UNIT[p.defId].traits.includes("装甲")) return value;
    const hp =
      UNIT[p.defId].hp * 2 ** (p.star - 1) + equipmentStats(p.items).hp;
    // Credit at most six damaged seconds, capped at 20% of body value.
    return (
      value + pieceStrength(p) * Math.min(0.2, ((armorRegen * 24) / hp) * 0.5)
    );
  }, 0);
  const mixed = frontlineFactor(
    pieces,
    active.some((s) => s.active && s.bonus.jump),
  );
  return (
    (base * (1 + bonus + teamBonus) +
      support +
      energySupport +
      coordination +
      sustain +
      preferred) *
    mixed
  );
}
/** Bounded combination search; never duplicates pieces or exceeds population. */
function candidateLineups(p: Player, difficulty: Difficulty): Piece[][] {
  const profile = profileFor(p),
    all = [...p.pieces].sort((a, b) => a.uid - b.uid),
    size = Math.min(p.level, all.length),
    width = DIFFICULTIES[difficulty].beam;
  // Beginner opponents choose individual strength, without searching trait combinations.
  if (difficulty === "relaxed")
    return [
      [...all]
        .sort((a, b) => pieceStrength(b) - pieceStrength(a) || a.uid - b.uid)
        .slice(0, size),
    ];
  let states: { indices: number[]; score: number }[] = [
    { indices: [], score: 0 },
  ];
  for (let depth = 0; depth < size; depth++) {
    const next: typeof states = [];
    for (const state of states)
      for (
        let i = (state.indices.at(-1) ?? -1) + 1;
        i <= all.length - (size - depth);
        i++
      ) {
        const indices = [...state.indices, i];
        next.push({
          indices,
          score: lineupScore(
            indices.map((j) => all[j]),
            profile,
          ),
        });
      }
    states = next
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.indices.join(",").localeCompare(b.indices.join(",")),
      )
      .slice(0, width);
  }
  const drafts = states.map((state) => state.indices.map((i) => all[i]));
  // Beam search can prune individually weak pieces before their completed trait pays off.
  // Seed attainable profile tiers explicitly, then fill remaining slots by marginal team value.
  const strongest = [...all]
    .sort((a, b) => pieceStrength(b) - pieceStrength(a) || a.uid - b.uid)
    .filter(
      (piece, index, sorted) =>
        sorted.findIndex((other) => other.defId === piece.defId) === index,
    );
  const cores: Piece[][] = [];
  for (const synergy of synergies(
    strongest.map((piece, index) => ({ ...piece, position: 32 + index })),
  )) {
    if (profile.traits.length && !profile.traits.includes(synergy.trait))
      continue;
    const members = strongest.filter((piece) =>
      UNIT[piece.defId].traits.includes(synergy.trait),
    );
    for (const count of synergy.tiers)
      if (count <= size && members.length >= count)
        cores.push(members.slice(0, count));
  }
  const singles = profile.traits.length ? [...cores] : [];
  for (let i = 0; i < singles.length; i++)
    for (let j = i + 1; j < singles.length; j++) {
      const combined = [...new Set([...singles[i], ...singles[j]])];
      if (combined.length <= size) cores.push(combined);
    }
  const key = (pieces: Piece[]) =>
    pieces
      .map((piece) => piece.uid)
      .sort((a, b) => a - b)
      .join(",");
  const seen = new Set<string>();
  for (const core of cores) {
    const signature = key(core);
    if (seen.has(signature)) continue;
    seen.add(signature);
    const candidate = [...core];
    while (candidate.length < size) {
      const next = all
        .filter((piece) => !candidate.includes(piece))
        .map((piece) => ({
          piece,
          score: lineupScore([...candidate, piece], profile),
        }))
        .sort((a, b) => b.score - a.score || a.piece.uid - b.piece.uid)[0];
      if (!next) break;
      candidate.push(next.piece);
    }
    drafts.push(candidate);
  }
  const unique = new Map(
    drafts.map((pieces) => [
      key(pieces),
      { pieces, score: lineupScore(pieces, profile) },
    ]),
  );
  return [...unique.entries()]
    .sort(([a, x], [b, y]) => y.score - x.score || a.localeCompare(b))
    .slice(0, width)
    .map(([, entry]) => entry.pieces);
}
export function chooseLineup(p: Player, difficulty: Difficulty): Piece[] {
  return candidateLineups(p, difficulty)[0] ?? [];
}
export function deployLineup(
  p: Player,
  difficulty: Difficulty,
  formation: "spread" | "compact" = "spread",
) {
  placeLineup(p, chooseLineup(p, difficulty), formation === "compact");
}
function placeLineup(p: Player, best: Piece[], compact = false) {
  const used = new Set<number>();
  for (const piece of p.pieces) piece.position = null;
  for (const piece of best.sort(
    (a, b) => pieceStrength(b) - pieceStrength(a) || a.uid - b.uid,
  )) {
    const u = UNIT[piece.defId];
    const positions = ["bomber", "flametrooper"].includes(u.id)
      ? [35, 36, 34, 37, 43, 44, 42, 45, 33, 38]
      : compact
        ? u.range > 1
          ? [63, 62, 55, 61, 54, 60, 53, 59, 52, 58]
          : [47, 46, 53, 45, 52, 44, 51, 43, 50, 42]
        : ["fish", "deer", "repair", "medic"].includes(u.id)
          ? [43, 44, 42, 45, 51, 52, 50, 53, 49, 54]
          : u.range > 1
            ? [56, 63, 59, 61, 57, 62, 58, 60, 48, 55]
            : u.id === "monk"
              ? [43, 44, 42, 45, 35, 36, 34, 37]
              : u.traits.includes("刺杀")
                ? [32, 39, 33, 38, 40, 47, 35, 36]
                : [35, 36, 34, 37, 33, 38, 32, 39, 43, 44];
    piece.position =
      positions.find((pos) => !used.has(pos)) ??
      Array.from({ length: 32 }, (_, i) => i + 32).find(
        (pos) => !used.has(pos),
      )!;
    used.add(piece.position);
  }
}
/** Visible armies only: no future shops, secret bonuses or free economy actions. */
export function tacticalOpponent(g: Game, p: Player): Piece[] {
  const encounter = encounterFor(g);
  if (encounter) return encounterArmy(encounter);
  const alive = g.players.filter((other) => other.hp > 0);
  if (alive.length < 2) return [];
  return alive[
    (alive.indexOf(p) + 1 + ((g.round - 1) % (alive.length - 1))) % alive.length
  ].pieces;
}
export function tacticalScore(
  pieces: Piece[],
  opponent: Piece[],
  version: CombatVersion = CURRENT_COMBAT_VERSION,
): number {
  const battle = simulateOutcome(pieces, opponent, version),
    last = battle.final;
  const health = (side: number) => {
    const team = last.fighters.filter((f) => (f.homeSide ?? f.side) === side);
    return (
      team.reduce((n, f) => n + Math.max(0, f.hp) / f.maxHp, 0) /
      Math.max(1, team.length)
    );
  };
  return (
    (battle.winner === 0 ? 10000 : battle.winner === null ? 0 : -10000) +
    (health(0) - health(1)) * 1000 +
    (battle.winner === 0 ? -1 : 1) * last.tick * 0.01
  );
}
export function deployTactically(g: Game, p: Player) {
  if (g.phase !== "prepare" || p.hp <= 0 || !p.pieces.length) return;
  const opponent = tacticalOpponent(g, p);
  if (!opponent.some((piece) => piece.position !== null)) return;
  const candidates = candidateLineups(p, "veteran").slice(0, 3);
  let bestScore = -Infinity,
    bestPositions: Map<number, number | null> | undefined;
  for (const candidate of candidates)
    for (const compact of [false, true]) {
      const preview = structuredClone(p);
      const ids = new Set(candidate.map((piece) => piece.uid));
      placeLineup(
        preview,
        preview.pieces.filter((piece) => ids.has(piece.uid)),
        compact,
      );
      equipBot(g, preview);
      const score = tacticalScore(preview.pieces, opponent, g.combatVersion);
      if (score > bestScore) {
        bestScore = score;
        bestPositions = new Map(
          preview.pieces.map((piece) => [piece.uid, piece.position]),
        );
      }
    }
  if (bestPositions)
    for (const piece of p.pieces)
      piece.position = bestPositions.get(piece.uid) ?? null;
}
export function savingsTarget(g: Game, p: Player): number {
  if (p.hp <= 35 || g.round >= 25) return 0;
  if (g.round <= 3) return 0;
  const base = Math.max(
    0,
    (g.round < 8 ? 10 : g.round < 15 ? 20 : 30) + profileFor(p).reserve,
  );
  if (p.hp <= 55) return Math.min(10, base);
  return p.streak <= -3 ? Math.max(0, base - 10) : base;
}
/** Value a held copy, not the desire to BUY another. Merged pieces and upgrade pairs
 * must not become expendable merely because merging removed their one-star copies. */
export function reservePriority(
  p: Player,
  piece: Piece,
  version: CombatVersion = CURRENT_COMBAT_VERSION,
): number {
  const unit = UNIT[piece.defId],
    profile = profileFor(p);
  const partners = p.pieces.filter(
    (other) =>
      other.uid !== piece.uid &&
      other.defId === piece.defId &&
      other.star === piece.star,
  ).length;
  const needed = mergeCount(p.pieces, piece.defId, piece.star, version);
  const distinct = new Set(p.pieces.map((other) => other.defId));
  const links = unit.traits.filter(
    (trait) =>
      profile.traits.includes(trait) &&
      [...distinct].some(
        (id) => id !== piece.defId && UNIT[id].traits.includes(trait),
      ),
  ).length;
  return (
    pieceStrength(piece) * 0.06 +
    unit.cost * pieceCopies(piece) +
    unit.traits.filter((trait) => profile.traits.includes(trait)).length * 5 +
    Math.min(partners, needed - 1) * 8 * piece.star +
    links * 6
  );
}
interface BotActions {
  buy(g: Game, p: Player, index: number): boolean;
  sell(g: Game, p: Player, uid: number): boolean;
  roll(g: Game, p: Player): boolean;
  buyXp(g: Game, p: Player): boolean;
}
export function prepareBot(g: Game, p: Player, actions: BotActions) {
  if (g.phase !== "prepare" || p.hp <= 0 || p.id === 0) return;
  const profile = profileFor(p),
    settings = DIFFICULTIES[g.difficulty],
    reserve = savingsTarget(g, p);
  const desire = (id: string) => {
    const u = UNIT[id],
      same = p.pieces.filter((x) => x.defId === id);
    if (same.some((x) => x.star === 3)) return -100;
    const pair = same.filter((x) => x.star === 1).length;
    const evolution =
      isInsect(id) && insectCount(p.pieces) > 0 && !same.length ? 4 : 0;
    const fit = u.traits.filter((t) => profile.traits.includes(t)).length;
    const existing = new Set(p.pieces.map((x) => x.defId));
    const link = existing.has(id)
      ? 0
      : u.traits.filter((t) =>
          p.pieces.some((x) => UNIT[x.defId].traits.includes(t)),
        ).length;
    return (
      u.cost +
      evolution +
      pair * 5 +
      same.filter((x) => x.star === 2).length * 3 +
      fit * 3 +
      link * 2
    );
  };
  const buyShop = () => {
    for (const index of p.shop
      .map((_, i) => i)
      .sort(
        (a, b) =>
          desire(p.shop[b] ?? "guard") - desire(p.shop[a] ?? "guard") || a - b,
      )) {
      const id = p.shop[index];
      if (!id) continue;
      const score = desire(id),
        upgrade =
          p.pieces.filter((x) => x.defId === id && x.star === 1).length >=
          mergeCount(
            [...p.pieces, { uid: -1, defId: id, star: 1, position: null }],
            id,
            1,
            g.combatVersion,
          ) -
            1,
        needsBodies = p.pieces.length < p.level;
      if ((score < 3 && !needsBodies) || score < 0) continue;
      if (!upgrade && !needsBodies && p.gold - UNIT[id].cost < reserve)
        continue;
      if (p.gold < UNIT[id].cost) continue;
      // Buy first: a full bench may still accept a merge, including a new insect kind.
      if (actions.buy(g, p, index)) continue;
      if (p.pieces.filter((x) => x.position === null).length < RULES.bench)
        continue;
      const incoming: Piece = {
        uid: g.nextUid,
        defId: id,
        star: 1,
        position: null,
      };
      const value = reservePriority(p, incoming, g.combatVersion);
      const expendable = p.pieces
        .filter((x) => x.position === null && x.defId !== id)
        .sort(
          (a, b) =>
            reservePriority(p, a, g.combatVersion) -
              reservePriority(p, b, g.combatVersion) || a.uid - b.uid,
        )[0];
      if (
        expendable &&
        value > reservePriority(p, expendable, g.combatVersion) + 4 &&
        actions.sell(g, p, expendable.uid)
      )
        actions.buy(g, p, index);
    }
  };
  deployLineup(p, g.difficulty);
  buyShop();
  const target = Math.min(
    10,
    3 + Math.floor(Math.max(0, g.round - settings.levelDelay) / 3),
  );
  for (
    let i = 0;
    i < settings.xpPurchases &&
    p.level < target &&
    p.pieces.length >= p.level &&
    p.gold >= reserve + 5;
    i++
  )
    actions.buyXp(g, p);
  for (let i = 0; i < settings.rolls && p.gold >= reserve + 6; i++) {
    actions.roll(g, p);
    buyShop();
  }
  deployLineup(p, g.difficulty);
  if (g.difficulty === "veteran") deployTactically(g, p);
  // Keep the legal eight-slot reserve. Make room only for a concrete better purchase.
  equipBot(g, p);
}
