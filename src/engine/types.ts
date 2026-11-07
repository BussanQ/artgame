export type Trait =
  | "步兵"
  | "装甲"
  | "野兽"
  | "熊猫"
  | "护卫"
  | "狙击"
  | "先锋"
  | "刺杀"
  | "骑兵"
  | "支援"
  | "召唤"
  | "傀儡"
  | "异虫"
  | "异能"
  | "空军"
  | "海神"
  | "攻城"
  | "爆破"
  | "不朽"
  | "灵能"
  | "猛禽"
  | "陆行者";
/** Ordered introductions: later rules inherit earlier capabilities. Keep legacy
 * exceptions explicit at their consumer rather than forgetting a new allowlist. */
export const COMBAT_VERSIONS = [
  "legacy", "tactics", "balanced", "signature", "summons", "legions",
  "brood", "airsea", "fleet", "metamorph", "infantry", "armored",
  "puppets", "wildfront", "ambush", "formations", "counterplay", "lineages",
  "coalitions", "aurora", "qi", "taotie", "tar", "lightning", "gospel",
  "thunderstorm", "jungle", "continuity", "wushi", "wushi-control", "shuriken", "secret-orb", "bombardment", "terminator", "warcry", "tornado", "wildfire", "boneblast", "thornbind", "rifle", "gaze", "hive", "bulwark", "spirit-ward", "tortoise", "execution", "siege", "inferno", "mending", "formless", "support-actions", "dream", "equipment-skills", "sea-fog",
] as const;
export type CombatVersion = typeof COMBAT_VERSIONS[number];
export const CURRENT_COMBAT_VERSION: CombatVersion = "sea-fog";
const hasRuleSince = (version: CombatVersion, first: CombatVersion) =>
  COMBAT_VERSIONS.indexOf(version) >= COMBAT_VERSIONS.indexOf(first);
export const hasBoneBlastRules = (version: CombatVersion) => hasRuleSince(version,"boneblast");
export const hasThornBindRules = (version: CombatVersion) => hasRuleSince(version,"thornbind");
export const hasRifleRules = (version: CombatVersion) => hasRuleSince(version,"rifle");
export const hasGazeRules = (version: CombatVersion) => hasRuleSince(version,"gaze");
export const hasHiveRules = (version: CombatVersion) => hasRuleSince(version,"hive");
export const hasBulwarkRules = (version: CombatVersion) => hasRuleSince(version,"bulwark");
export const hasSpiritWardRules = (version: CombatVersion) => hasRuleSince(version,"spirit-ward");
export const hasTortoiseRules = (version: CombatVersion) => hasRuleSince(version,"tortoise");
export const hasSiegeRules = (version: CombatVersion) => hasRuleSince(version,"siege");
export const hasInfernoRules = (version: CombatVersion) => hasRuleSince(version,"inferno");
export const hasMendingRules = (version: CombatVersion) => hasRuleSince(version,"mending");
export const hasFormlessRules = (version: CombatVersion) => hasRuleSince(version,"formless");
export const hasSupportActionRules = (version: CombatVersion) => hasRuleSince(version,"support-actions");
export const hasDreamRules = (version: CombatVersion) => hasRuleSince(version,"dream");
export const hasEquipmentSkillRules = (version: CombatVersion) => hasRuleSince(version,"equipment-skills");
export const hasWhaleEyeRules = (version: CombatVersion) => hasRuleSince(version,"sea-fog");
export const hasExecutionRules = (version: CombatVersion) => hasRuleSince(version,"execution");
export const hasWildfireRules = (version: CombatVersion) => hasRuleSince(version,"wildfire");
export const hasTornadoRules = (version: CombatVersion) => hasRuleSince(version,"tornado");
export const hasWarcryRules = (version: CombatVersion) => hasRuleSince(version,"warcry");
export const hasTerminatorRules = (version: CombatVersion) => hasRuleSince(version,"terminator");
export const hasBombardmentRules = (version: CombatVersion) => hasRuleSince(version,"bombardment");
export const hasShurikenRules = (version: CombatVersion) => hasRuleSince(version,"shuriken");
export const hasSecretOrbRules = (version: CombatVersion) => hasRuleSince(version,"secret-orb");
export const hasWushiRules = (version: CombatVersion) => hasRuleSince(version,"wushi");
export const hasWushiControlRules = (version: CombatVersion) => hasRuleSince(version,"wushi-control");
export const hasJungleRules = (version: CombatVersion) => hasRuleSince(version,"jungle");
export const hasStormRules = (version: CombatVersion) => hasRuleSince(version,"thunderstorm");
export const hasGospelRules = (version: CombatVersion) => hasRuleSince(version,"gospel");
export const hasLightningRules = (version: CombatVersion) =>
  hasRuleSince(version,"lightning");
export const hasTarRules = (version: CombatVersion) =>
  hasRuleSince(version,"tar");
export const hasTaotieRules = (version: CombatVersion) =>
  hasRuleSince(version,"taotie");
export function hasQiRules(version: CombatVersion) {
  return hasRuleSince(version,"qi");
}
/** Sky-crab's recovered spell and versioned portrait. */
export function hasAuroraRules(version: CombatVersion) {
  return hasRuleSince(version,"aurora");
}
/** Early air/support/summon/siege rules, retained by subsequent unit updates. */
export function hasCoalitionRules(version: CombatVersion) {
  return hasRuleSince(version,"coalitions");
}
/** Corrected April/May professions and abnormal lifesteal. */
export function hasLineageRules(version: CombatVersion) {
  return hasRuleSince(version,"lineages");
}
/** The cavalry recovery penalty and cumulative sniper/sea/psychic rules. */
export function hasCounterplayRules(version: CombatVersion) {
  return hasRuleSince(version,"counterplay");
}
/** Pangolin's corrected definition, burrow skill and independent assassin opening jump. */
export function hasAmbushRules(version: CombatVersion) {
  return hasRuleSince(version,"ambush");
}
/** 0.54 accidentally omitted evolution. Freeze its old results; 0.55 restores it. */
export function hasInsectEvolutionRules(version: CombatVersion) {
  return version !== "jungle" && hasRuleSince(version,"brood");
}
export type Difficulty = "relaxed" | "standard" | "veteran";
export interface UnitDef {
  flying?: boolean;
  id: string;
  name: string;
  cost: number;
  traits: Trait[];
  hp: number;
  attack: number;
  armor: number;
  armorPerStar?: number;
  range: number;
  interval: number;
  skill: string;
  color: string;
  glyph: string;
  initialMana?: number;
  /** Innate resistance and HP per second; absent on historical definitions. */
  magicResist?: number;
  regeneration?: number;
}
export interface Piece {
  /** A replaced species stays on its match's original catalog, including future purchases. */
  definitionVersion?: CombatVersion;
  /** Actual copies withdrawn from the pool, independent of discounted insect evolution. */
  copies?: number;
  uid: number;
  defId: string;
  star: number;
  position: number | null;
  items?: string[];
  encounterPower?: number;
}
export type AiProfileId =
  | "infantry"
  | "assassins"
  | "beasts"
  | "fleet"
  | "pandas"
  | "insects"
  | "psychic"
  | "armor"
  | "puppets";
export interface Player {
  /** Stable doctrine for new games; absent on legacy saves, which retain seat-based profiles. */
  aiProfile?: AiProfileId;
  id: number;
  name: string;
  hp: number;
  gold: number;
  level: number;
  xp: number;
  streak: number;
  pieces: Piece[];
  shop: (string | null)[];
  locked: boolean;
  inventory: string[];
  eliminatedRound?: number;
}
export interface Game {
  /** Unit price and pool tier at match creation; not changed by battle upgrades. */
  catalogVersion?: CombatVersion;
  /** Fixed for the whole match; absent on pre-rotation saves. */
  bannedSeries?: import("./rotation").Series[];
  combatVersion: CombatVersion;
  difficulty: Difficulty;
  seed: number;
  nextUid: number;
  round: number;
  phase: "prepare" | "battle" | "result" | "finished";
  players: Player[];
  pool: Record<string, number>;
  message: string;
  history: RoundReport[];
  encountersFromRound: number;
  reward: { round: number; choices: string[] } | null;
}
export interface RoundReport {
  combatVersion: CombatVersion;
  round: number;
  opponentId: number;
  opponentName: string;
  kind: "pvp" | "pve";
  reward?: string;
  winner: 0 | 1 | null;
  damage: number;
  income: number;
  hp: number;
  gold: number;
  left: Piece[];
  right: Piece[];
  /** Player reserves at settlement, before elimination returns them to the pool. Older reports omit this snapshot. */
  bench?: Piece[];
  /** Unequipped items at settlement, before elimination clears them. Older reports omit this snapshot. */
  inventory?: string[];
}
export interface Fighter {
  siege?:{formed:number;fired:number;impacts:number;splashHits:number;splashDamage:number;interrupted:number;mode?:boolean;actedAt?:number;
    casting?:{start:number;release:number;side:0|1};
    shells:{start:number;landAt:number;from:{x:number;y:number};to:{x:number;y:number};damage:number;side:0|1}[];
    shot?:{start:number;landAt:number;from:{x:number;y:number};to:{x:number;y:number}};pulse?:{tick:number;x:number;y:number}};
  reaper?:{marks:number;trueHits:number;trueDamage:number;executions:number;enhanced:number;puppets:number;interrupted:number;missed:number;actedAt?:number;
    casting?:{start:number;release:number;target:number;side:0|1;power:number}};
  reaperMarks?:{source:number;stacks:number}[];
  /** A separate, short-lived actor preserves the victim's original contribution history. */
  executionPuppet?:{owner:number;victim:number;born:number;until:number};
  tortoise?:{formed:number;interrupted:number;taunts:number;swings:number;splashHits:number;
    mode?:"shell"|"breach";allies?:number;enemies?:number;actedAt?:number;strike?:{tick:number;x:number;y:number};
    casting?:{start:number;release:number;side:0|1}};
  /** Maintained friendly connections; effective protection is never added to permanent body stats. */
  spiritWard?:{formed:number;protected:number;severed:number;interrupted:number;mitigated:number;physicalSaved:number;magicSaved:number;actedAt?:number;
    channel?:{start:number;release:number;until:number;side:0|1;targets:number[];formed:boolean;armor:number;resist:number}};
  spiritWards?:{source:number;until:number;armor:number;resist:number}[];
  /** Short personal armor stance with a one-time adjacent taunt. */
  bulwark?:{formations:number;taunts:number;start:number;until:number;armor:number};
  hive?: {
    volleys:number; needles:number; explosions:number; innerHits:number; outerHits:number; interrupted:number;
    actedAt?:number;
    burst?:{target:number;next:number;remaining:number;side:0|1};
    casting?:{start:number;release:number;side:0|1;center:{x:number;y:number};inner:number;outer:number;innerDamage:number;outerDamage:number};
    pulse?:{start:number;until:number;center:{x:number;y:number};inner:number;outer:number};
  };
  /** Instant eye control; its dispellable mark persists without a maintained channel. */
  gaze?: { selections:number; controls:number; manaDrained:number };
  gazed?: { source:number; until:number; nextDrain:number; drain:number };
  /** Passive rifle training: one real hit per ordinary attack, no energy skill. */
  rifle?:{shots:number};
  /** Maintained, segmented life drain; the short root has a real gap before the next pulse. */
  thornbind?: {
    pulses:number; hits:number; roots:number; healing:number; retargets:number; interrupted:number;
    actedAt?:number;
    channel?:{start:number;next:number;remaining:number;target:number;to:{x:number;y:number};damage:number;side:0|1};
  };
  thornRoot?:{source:number;until:number};
  /** Fixed-point bone orbs continue after launch; stun applications are counted separately from damage. */
  boneblast?: {
    launched: number; detonated: number; hits: number; stuns: number; interrupted: number;
    orbs: { start: number; landAt: number; from: { x: number; y: number };
      to: { x: number; y: number }; damage: number; side: 0 | 1 }[];
  };
  /** Fixed-area fire channel; rebirth does not reset its cooldown or the once-per-fight passive. */
  wildfire?: {
    formed: number; pulses: number; hits: number; interrupted: number;
    eggs: number; hatches: number; brokenEggs: number;
    casting?: { start: number; until: number; from: { x: number; y: number };
      to: { x: number; y: number }; damage: number; side: 0 | 1 };
    channel?: { start: number; until: number; from: { x: number; y: number };
      to: { x: number; y: number }; damage: number; side: 0 | 1; nextIndex: number; totalPulses: number };
  };
  /** Released, moving cyclones retain their launch side and cast-time spell power. */
  tornado?: {
    launched: number; contacts: number; knockups: number; landings: number;
    vortices: { start: number; from: { x: number; y: number }; dx: number; dy: number;
      traveled: number; damage: number; side: 0 | 1; hit: number[] }[];
  };
  /** Personal retaliation is separate from the psychic team reflection bonus. */
  warcry?: {
    roars: number; petrified: number; retaliations: number;
    retaliationDamage: number; retaliationShield: number;
    until: number; reflection: number;
    roar?: { start: number; from: { x: number; y: number }; to: { x: number; y: number } };
  };
  petrifyUntil?: number;
  /** Two separately launched artillery rounds; control cancels only unfired rounds. */
  terminator?: {
    smallLaunched: number; largeLaunched: number; detonated: number; hits: number;
    missiles: {
      kind: "small" | "large"; start: number; landAt: number;
      from: { x: number; y: number }; to: { x: number; y: number };
      damage: number; side: 0 | 1;
    }[];
  };
  /** Released squadrons sweep a fixed rectangle once, even after the carrier dies. */
  bombardment?: {
    launched: number;
    hits: number;
    raids: {
      start: number; from: { x: number; y: number }; dx: number; dy: number;
      traveled: number; damage: number; side: 0 | 1; hit: number[];
    }[];
  };
  /** Maintained forward orb; caster interruption cancels startup and remaining pulses. */
  secretOrb?: {
    formed: number; pulses: number; hits: number; energyRemoved: number; interrupted: number;
    casting?: {
      start: number; until: number; damage: number; radius: number; side: 0 | 1;
      from: { x: number; y: number }; to: { x: number; y: number };
    };
    channel?: {
      x: number; y: number; start: number; until: number; nextIndex: number;
      damage: number; radius: number; side: 0 | 1;
    };
  };
  /** Locked ground spell; released blades and fields retain their launch allegiance. */
  shuriken?: {
    launched: number; landings: number; pulses: number; hits: number; interrupted: number;
    casting?: {
      start: number; until: number; damage: number; radius: number; side: 0 | 1;
      from: { x: number; y: number }; to: { x: number; y: number };
    };
    blades: {
      start: number; until: number; damage: number; radius: number; side: 0 | 1;
      from: { x: number; y: number }; to: { x: number; y: number };
    }[];
    fields: {
      x: number; y: number; start: number; until: number; next: number;
      remaining: number; damage: number; radius: number; side: 0 | 1;
    }[];
  };
  /** Timed personal armor and ordinary cleaves; absent from historical sweep masters. */
  wushi?: {
    /** Present only after the client-card correction: capped cleaves and taunt applications. */
    taunts?: number;
    forms: number;
    sweeps: number;
    splashHits: number;
    interrupted: number;
    until: number;
    armor: number;
    casting?: { start: number; until: number };
  };
  /** Short forced aggression; source death, invalid allegiance or cleanse releases it. */
  taunt?: { source: number; until: number; kind?:"bulwark"|"tortoise"|"dream" };
  /** Released forest waves and actual two-stage control applications, battle-local only. */
  jungle?: { waves: number; hits: number; knockups: number; landings: number };
  /** A committed knockup lands even after its caster dies; cleansing removes the pending stun. */
  jungleLandings?: { source: number; at: number; duration: number; kind?: "tornado" }[];
  /** Versioned traveling thunderstorm; committed bolts survive death and crowd control. */
  storm?: {
    launched: number;
    hits: number;
    energyRemoved: number;
    bolts: {
      x: number; y: number; dx: number; dy: number;
      traveled: number; damage: number; side: 0 | 1; hit: number[];
    }[];
  };
  /** Battle-local passive field; absent from historical active-charging acolytes. */
  gospelAura?: {
    pulses: number;
    peakTargets: number;
    lastTick: number;
    targets: number[];
  };
  /** Ordinary physical chain attacks, absent from historical active-spell fighters. */
  lightningChain?: true;
  /** Sticky charges follow living carriers; committed explosives survive interruption and caster death. */
  tar?: {
    launched: number;
    detonated: number;
    bombs: {
      target: number;
      x: number;
      y: number;
      until: number;
      damage: number;
      splash: number;
      attached: boolean;
    }[];
  };
  taotie?: { feasts: number; rage?: { until: number; attack: number } };
  innateRegen?: true;
  /** Client-card qi palm; absent on earlier arhat fighters. */
  qiSkill?: true;
  /** S50 sky-crab spell and per-battle additive 25% attack stacks; absent on old replays. */
  aurora?: { stacks: number };
  /** Versioned pangolin spell; absent on historical fighters. */
  burrowSkill?: true;
  /** Opening assassin formation, independent of blade-thrall's personal passive. */
  assassinCrit?: {
    chance: number;
    multiplier: number;
    attempts: number;
    crits: number;
    seed?: number;
  };
  /** Acid is battle-local, strongest active application wins with independent expiry. */
  corrosion?: { source: number; armor: number; until: number }[];
  /** Vertical presentation only; stun controls action timing and board occupancy stays unchanged. */
  knockup?: { start: number; until: number };
  /** Opening six-puppet team attack; carried into later summons, never own-trait attack. */
  teamAttack?: number;
  /** Personal plus team puppet attack, for the current fighter's displayed total only. */
  formationAttack?: number;
  /** Opening attack-speed ratio; personal two-beast speed is not inherited by summons. */
  formationHaste?: number;
  /** Four/six-beast team speed, also applied to later summons. */
  teamHaste?: number;
  /** Battle-local consecutive attack state; never stored on a permanent Piece. */
  gale?: { target: number | null; stacks: number; side: 0 | 1 };
  bladeCrit?: { attempts: number; crits: number; seed?: number };
  bladeStorm?: {
    until: number;
    next: number;
    remaining: number;
    damage: number;
  };
  /** Iron rooster grants; each source retains its own expiration. */
  command?: {
    source: number;
    side: 0 | 1;
    until: number;
    attack: number;
    armor: number;
  }[];
  bird?: {
    shots: number;
    draw?: { target: number; until: number; damage: number };
  };
  /** Enemy opening infantry formation; persists through cleanse and is inherited by summons. */
  infantryArmorBreak?: number;
  /** Per-battle active-skill cooldown, used by multi-pulse active skills. */
  skillReadyAt?: number;
  phoenix?: {
    spent: boolean;
    eggUntil: number;
    bodyMaxHp: number;
    hatched: boolean;
  };
  hawkForm?: { active: boolean };
  combo?: { target: number; next: number; remaining: number };

  groundBonus?: number;
  /** Opening three-summoner bonus; applies once per successful ordinary attack action. */
  damageManaBonus?: number;
  /** Personal equipment recovery; never copied to summoned or converted actors. */
  equipmentDamageMana?: number;
  attackManaReady?: boolean;
  trueAttack?: boolean;
  devourSpent?: boolean;
  slow?: { until: number; multiplier: number };
  /** Independent applied attack-speed reductions: strongest active grant wins. */
  attackSlows?: {source:number;rate:number;until:number}[];
  /** Released allied haste grants, independently expiring; only the strongest applies. */
  mendHaste?: {source:number;ratio:number;until:number}[];
  formless?: {
    activations:number;hits:number;damage:number;shieldDamage:number;
    active?:{start:number;until:number};
  };
  mending?: {
    completed:number;healing:number;energy:number;hastes:number;interrupted:number;missed:number;
    casting?:{start:number;release:number;side:0|1;target:number;power:number};
    pulse?:{tick:number;target:number;from:{x:number;y:number};to:{x:number;y:number}};
    actedAt?:number;
  };
  inferno?: {
    formed:number;hits:number;slows:number;healing:number;interrupted:number;
    casting?:{start:number;release:number;side:0|1;power:number};
    active?:{start:number;until:number};
    pulse?:{tick:number;x:number;y:number};
    actedAt?:number;
  };
  windup?: {
    until: number;
    target: number;
    damage: number;
    damageType?: DamageType;
  };
  sonic?: { source: number; next: number; remaining: number; damage: number }[];

  reflection?: number;
  immortal?: { duration: number; until: number; spent: boolean };
  air?: {
    /** Four-raptor benefit is shared by every flying ally, lost while on the ground. */
    groundBonus?: number;
    /** Early siege benefits direct skill damage and adds immortal targets. */
    siegeDirect?: true;
    /** Early sea formation; unbuffed opening resistance lets landing/rebirth restore the cap correctly. */
    seaWard?: number;
    seaBaseResist?: number;
    flying: boolean;
    evasion: number;
    attempts: number;
    seaMana: number;
    seaTick: number;
    siege: number;
    magicBreak: number;
    antiAir: boolean;
    phaseUntil: number;
    cast?: {
      kind:
        | "bomber"
        | "ark"
        | "bombardment"
        | "terminator"
        | "warcry"
        | "tornado"
        | "boneblast"
        | "eel"
        | "phoenix"
        | "whale"
        | "medic"
        | "motorcycle"
        | "tar"
        | "ironape"
        | "irondog"
        | "specialist"
        | "storm"
        | "jungle";
      target?: number; // Unit lock for specialist aiming; area spells keep only coordinates.
      marked?: number[];
      splash?: number;
      secondaryDamage?: number; // Terminator's frozen second round, not a second mana expense.
      next: number;
      remaining: number;
      damage: number;
      from: { x: number; y: number };
      to: { x: number; y: number };
    };
  };
  attackBoost?: { until: number; ratio: number };
  homeSide?: 0 | 1;
  energyMultiplier?: number;
  /** Opposing cavalry subtracts this from each positive energy recovery, after the multiplier. */
  energyPenalty?: number;
  /** Attacker-only flat physical armor penetration; never changes the target's debuffs. */
  armorPenetration?: number;
  deathBurst?: "ready" | "spent";
  charmCast?: "ready" | "spent";
  dream?: { selections:number; controls:number; taunts:number; released:number; cleansed:number; hits:number; damage:number; shieldDamage:number };
  charm?: { until: number; attack: number; side: 0 | 1; source?:number; bonus?:number };
  summoning?: { kind: "puppet" | "sentinel"; readyAt: number; spent: boolean };
  summonWard?: number;
  packCall?: "ready" | "spent";
  summon?: { owner: number; born: number; kind?: "puppet" | "sentinel"; item?:"wolf-fang" };
  equipmentSkills?: {
    resonance?: {readyAt:number; activations:number; damage:number; shieldDamage:number};
    call?: {readyAt:number; activations:number; summoned:number};
    fog?: {
      readyAt:number; activations:number; detonations:number; hits:number;
      damage:number; shieldDamage:number; energyRecovered:number;
      pending?:{start:number;landAt:number;side:0|1;from:{x:number;y:number}};
    };
  };
  signature?: {
    casts: number;
    attacks: number;
    concealed: boolean;
    carapace?: { start: number; until: number };
  };
  uid: number;
  defId: string;
  star: number;
  side: 0 | 1;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  armor: number;
  range: number;
  interval: number;
  cooldown: number;
  mana: number;
  damage: number;
  flash: boolean;
  shield: number;
  shieldUntil: number;
  stunUntil: number;
  hasteUntil: number;
  armorBreak: number;
  armorBreakUntil: number;
  healing: number;
  absorbed: number;
  lifesteal: number;
  /** Opening abnormal formation share; summons inherit this, never the owner's gear. */
  teamLifesteal?: number;
  skillPower: number;
  magicResist: number;
  regeneration: number;
  /** Armor formation regeneration per tick; opening bonus retained for the battle. */
  armorRegen?: number;
  attackShred: number;
  armorBuff: number;
  armorBuffUntil: number;
  manaLockUntil: number;
  silenceUntil?: number;
  burn?: { source: number; next: number; remaining: number; damage: number }[];
  supportHeal: number;
  supportMana: number;
}
export type DamageType = "physical" | "magic" | "true";
export interface CombatEffect {
  /** Personal equipment recovery is separate from energy supplied to allies. */
  item?: "whale-eye";
  chainHop?: number;
  source: number;
  target: number;
  kind:
    | "equipment"
    | "taunt"
    | "slow"
    | "sonic"
    | "burn"
    | "flame"
    | "grenade"
    | "tar"
    | "windup"
    | "devour"
    | "transform"
    | "rebirth"
    | "reflect"
    | "energize"
    | "drain"
    | "chain"
    | "immortal"
    | "cast"
    | "pulse"
    | "heal"
    | "shield"
    | "stun"
    | "haste"
    | "break"
    | "teleport"
    | "knockback"
    | "fortify"
    | "cleanse"
    | "silence";
  amount: number;
  name: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}
export interface CombatEvent {
  /** One original equipment packet; reflections and later death effects keep their own identity. */
  item?:"soul-crystal"|"whale-eye";
  /** Avoided consumption of existing HP/shield; credited to one strongest live deer connection. */
  ward?:{source:number;prevented:number};
  /** Secondary ordinary physical contact made by the transformed panda's cleave. */
  wushiSplash?: true;
  /** Zero is the initiating attack; later hops remain ordinary physical damage. */
  chainHop?: number;
  assassinCritical?: boolean;
  /** Strengthened ordinary attack; still subject to attack defenses and lifesteal. */
  empowered?: boolean;
  /** Staff-thrall attack stack, separate from critical/empowered damage. */
  gale?: number;
  strike?: number;
  periodic?: boolean;
  reflected?: boolean;
  immune?: boolean;
  evaded?: boolean;
  attacker: number;
  target: number;
  amount: number;
  skill: boolean;
  ranged: boolean;
  damageType: DamageType;
  absorbed: number;
  primary: boolean;
  from: { x: number; y: number };
  to: { x: number; y: number };
}
export interface Frame {
  tick: number;
  fighters: Fighter[];
  events: CombatEvent[];
  effects: CombatEffect[];
}
export interface Battle {
  frames: Frame[];
  winner: 0 | 1 | null;
  damage: number;
}
