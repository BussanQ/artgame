import { TERMINATOR_DEMO } from "./data/terminator-demo";
import { WARCRY_DEMO } from "./data/warcry-demo";
import { TORNADO_DEMO } from "./data/tornado-demo";
import { WILDFIRE_DEMO } from "./data/wildfire-demo";
import { BONEBLAST_DEMO } from "./data/boneblast-demo";
import {THORNBIND_DEMO} from "./data/thornbind-demo";
import {HIVE_DEMO} from "./data/hive-demo";
import {BULWARK_DEMO} from "./data/bulwark-demo";
import {SIEGE_DEMO} from "./data/siege-demo";
import {INFERNO_DEMO} from "./data/inferno-demo";
import {MENDING_DEMO} from "./data/mending-demo";
import {FORMLESS_DEMO} from "./data/formless-demo";
import {EQUIPMENT_SKILLS_DEMO} from "./data/equipment-skills-demo";
import {WHALE_EYE_DEMO} from "./data/whale-eye-demo";
import {DETONATION_DEMO} from "./data/detonation-demo";
import {DREAM_DEMO} from "./data/dream-demo";
import {SUPPORT_ACTIONS_DEMO} from "./data/support-actions-demo";
import {EXECUTION_DEMO} from "./data/execution-demo";
import {TORTOISE_SHELL_DEMO,TORTOISE_BREACH_DEMO} from "./data/tortoise-demo";
import {SPIRIT_WARD_DEMO} from "./data/spirit-ward-demo";
import {GAZE_DEMO} from "./data/gaze-demo";
import {RIFLE_DEMO} from "./data/rifle-demo";
import { BOMBARDMENT_DEMO } from "./data/bombardment-demo";
import { WUSHI_DEMO } from "./data/wushi-demo";
import { SHURIKEN_DEMO } from "./data/shuriken-demo";
import { SECRET_ORB_DEMO, SECRET_ORB_COUNTER_DEMO } from "./data/secret-orb-demo";
import { THUNDERSTORM_DEMO } from "./data/thunderstorm-demo";
import { JUNGLE_DEMO } from "./data/jungle-demo";
import { LIGHTNING_DEMO } from "./data/lightning-demo";
import { GOSPEL_DEMO } from "./data/gospel-demo";
import { restartMarkup } from "./ui/restart";
import { TAR_DEMO } from "./data/tar-demo";
import { TAOTIE_DEMO } from "./data/taotie-demo";
import { catalogVersion, catalogDefinitionVersion } from "./data/catalog";
import { synergyPanelMarkup } from "./ui/synergies";
import { saveNoticeMarkup } from "./ui/save-notice";
import { LINGJIU_DEMO } from "./data/lingjiu-demo";
import { WILDFRONT_DEMO } from "./data/wildfront-demo";
import { ASSASSIN_DEMO } from "./data/assassin-demo";
import { COUNTERPLAY_DEMO } from "./data/counterplay-demo";
import { ABNORMAL_DEMO } from "./data/abnormal-demo";
import { COALITION_DEMO } from "./data/coalition-demo";
import { AURORA_DEMO } from "./data/aurora-demo";
import { unitDefinition, unitSprite } from "./data/unit-stats";
import { BEAST_FRONTLINE_DEMO } from "./data/beast-frontline-demo";
import { STAFFTHRALL_DEMO } from "./data/staffthrall-demo";
import { SHIELDTHRALL_DEMO } from "./data/shieldthrall-demo";
import { BLADETHRALL_DEMO } from "./data/bladethrall-demo";
import { SWORDTHRALL_DEMO } from "./data/swordthrall-demo";
import { AXETHRALL_DEMO } from "./data/axethrall-demo";
import { rotationMarkup } from "./ui/rotation";
import {
  CURRENT_COMBAT_VERSION,
  hasCoalitionRules,
  hasTaotieRules,
  hasTarRules,
  hasLightningRules,
  hasAuroraRules,
  hasQiRules,
} from "./engine/types";
import { recruitmentMarkup } from "./ui/recruitment";
import { debugShopMarkup } from "./ui/debug-shop";
import { queueShopCommand, removeShopCommand } from "./engine/debug-shop";
import { incomeMarkup } from "./ui/income";
import { salePrice } from "./engine/progression";
import { BattleComputer, ComputationCancelled } from "./compute/client";
import { analyzeBattle, type BattleMetric } from "./engine/battle-analysis";
import { fighterName, fighterSprite } from "./engine/summons";
import { battleAnalysisMarkup, BATTLE_METRICS } from "./ui/battle-analysis";
import type { ComputeJob, ComputeResult } from "./compute/job";
import { GameAudio } from "./audio/player";
import { BattleSoundTrack } from "./audio/cues";
import {
  loadPreferences,
  savePreferences,
  settingsMarkup,
  QUALITY,
} from "./ui/preferences";
import { deploymentMarkup, reserveEquipmentHint } from "./ui/deployment";
import { DialogFocus } from "./ui/dialog-focus";
import { PausableDelay } from "./ui/pausable-delay";
import { AI_PROFILES, profileFor, DIFFICULTIES } from "./data/ai-profiles";
import { deployLineup } from "./engine/ai";
import { applyRecommendedDeployment } from "./engine/deployment";
import { scoutingMarkup } from "./ui/scouting";
import {
  equipmentMarkup,
  equipmentOverviewMarkup,
  equipmentView,
  rewardMarkup,
  encounterMarkup,
} from "./ui/equipment";
import { equip, unequip, craft, claimReward } from "./engine/equipment";
import { SaveStore, SAVE_KEY, type PlaybackSave } from "./engine/persistence";
import { historyMarkup } from "./ui/match-history";
import { matchSummaryMarkup } from "./ui/match-summary";
import {
  codexMarkup,
  refreshCodex,
  resetCodex,
  codexFilters,
} from "./ui/unit-codex";
import "./style.css";
import {
  resultMarkup,
  RESULT_DURATION_MS,
  type ResultPresentation,
} from "./ui/battle-result";
import { BenchTooltip, pieceInfoMarkup } from "./ui/bench-tooltip";
import "./visual.css";
import "./compact.css";
import "./toolbar.css";
import "./equipment-overview.css";
import "./recruitment-layout.css";
import "./mobile-navigation.css";
import "./battle-inspection.css";
import "./command-layout.css";
import "./debug-shop.css";
import { BattleScene, spriteUrl } from "./render/scene";
import type { Battle, CombatVersion, Game } from "./engine/types";
import { UNIT, UNITS, RULES, XP } from "./data/units";
import {
  createGame,
  buy,
  move,
  roll,
  sell,
  buyXp,
  settle,
  nextRound,
  rankings,
} from "./engine/game";
import type { RoundResult } from "./engine/game";
import { synergies } from "./engine/synergies";
import type { Fighter, Piece } from "./engine/types";
const app = document.querySelector<HTMLDivElement>("#app")!;
let storage: Storage | null = null;
try {
  storage = window.localStorage;
} catch {
  /* Private/blocked storage: keep the game playable. */
}
const preferences = loadPreferences(
  storage,
  window.matchMedia("(prefers-reduced-motion: reduce)").matches,
);
const audio = new GameAudio();
audio.configure(preferences);
const soundTrack = new BattleSoundTrack();
const dialogs = new DialogFocus(app);
let equipmentOverviewOpen = false;
let equipmentHeldOnly = false;
let settingsOpen = false;
let debugOpen = false;
let debugCommand = "/";
let debugQuantity = "1";
let debugNotice: { ok: boolean; message: string } | null = null;
let unitInfo: Piece | null = null;
let unitInfoVersion: CombatVersion | null = null;
let unitInfoFinal = false;
let deploymentOpen = false;
const mobileViewport = window.matchMedia("(max-width: 700px)");
const mobileViews = [
  "battlefield",
  "recruitment",
  "armory",
  "commander",
  "intel",
] as const;
type MobileView = (typeof mobileViews)[number];
const mobileViewFromHash = () =>
  mobileViews.find((view) => view === window.location.hash.slice(1));
let mobileView: MobileView = mobileViewFromHash() ?? "battlefield";
let mobileToolsOpen = false;
function syncMobileNavigation() {
  const shell = app.querySelector<HTMLElement>(".shell");
  if (shell) shell.dataset.mobileView = mobileView;
  app
    .querySelector("#game-tools")
    ?.classList.toggle("is-open", mobileToolsOpen);
  const toggle = app.querySelector("[data-action=mobile-tools]");
  toggle?.setAttribute("aria-expanded", String(mobileToolsOpen));
  if (toggle) toggle.textContent = mobileToolsOpen ? "收起" : "菜单";
  app
    .querySelectorAll<HTMLElement>(".mobile-dock [data-jump]")
    .forEach((button) => {
      if (button.dataset.jump === mobileView)
        button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
}
function showMobileView(view: MobileView, updateHash = true) {
  mobileView = view;
  mobileToolsOpen = false;
  benchTooltip.hide();
  syncMobileNavigation();
  if (updateHash && window.location.hash !== `#${view}`) {
    try {
      window.history.replaceState(window.history.state, "", `#${view}`);
    } catch {
      // Restricted history access must not prevent switching the visible panel.
    }
  }
  document
    .getElementById(view)
    ?.scrollIntoView({ block: "start", behavior: "auto" });
}
window.addEventListener("hashchange", () => {
  const view = mobileViewFromHash();
  if (view && mobileViewport.matches) showMobileView(view, false);
});
const disclosures = new Map<string, boolean>();
let hiddenAt: number | null = null;
const saves = new SaveStore(storage);
const restored = saves.load();
let saveNotice = restored.data
  ? `${restored.status === "recovered" ? "主存档异常，已从备份恢复" : restored.status === "migrated" ? "存档已升级并恢复" : "已恢复上次演习"} · 第 ${restored.data.game.round} 回合`
  : restored.status === "damaged"
    ? "原存档无法读取，已打开新对局。"
    : "";
let renderedSaveNotice = "";
let saveConflict = false;
let lastSaveAt = 0;
let historyOpen = false;
let restartOpen = false;
let scoutId: number | null = null;
let replayRound: number | null = null;
let analysisView: {
  battle: Battle;
  at: number;
  limit: number;
  title: string;
} | null = null;
let analysisMetric: BattleMetric = "damage";
let game = restored.data?.game ?? createGame(Date.now() >>> 0),
  selected: number | null = null,
  result: RoundResult | null = null,
  frame = 0,
  speed = restored.data?.playback.speed ?? 1,
  help = false,
  codex = false;
let timer: ReturnType<typeof setInterval> | undefined;
let scene: BattleScene | undefined;
const computer = new BattleComputer();
let computationId = 0;
let computing = false;
let computeError = "";
let pendingJob: {
  job: ComputeJob;
  apply: (value: ComputeResult) => void;
  label: string;
} | null = null;
let playbackTime = restored.data?.playback.time ?? 0;
let demoBattle: Battle | null = null;
let demoTitle="兵种演习";
let battleInspection: { battle: Battle | null; uid: number | null } = {
  battle: null,
  uid: null,
};
let summonDemo = false;
let insectDemo = false;
let airseaDemo = false;
let immortalDemo = false;
let wildDemo = false;
let riderDemo = false;
let armorDemo = false;
let axeDemo = false;
let bladeDemo = false;
let shieldDemo = false;
let lingjiuDemo = false;
let wildfrontDemo = false;
let assassinDemo = false;
let counterplayDemo = false;
let abnormalDemo = false;
let coalitionDemo = false;
let auroraDemo = false;
let taotieDemo = false;
let tarDemo = false;
let lightningDemo = false;
let gospelDemo = false;
let thunderstormDemo = false;
let jungleDemo = false;
let wushiDemo = false;
let shurikenDemo = false;
let secretOrbDemo = false;
let secretOrbCounterDemo = false;
let bombardmentDemo = false;
let terminatorDemo = false;
let warcryDemo = false;
let tornadoDemo = false;
let wildfireDemo = false;
let boneblastDemo = false;
let thornbindDemo = false;
let spiritWardDemo = false;
let bulwarkDemo = false;
let hiveDemo = false;
let gazeDemo = false;
let rifleDemo = false;
let beastDemo = false;
let staffDemo = false;
let swordDemo = false;
let paused = restored.data?.playback.paused ?? false;
let resultPresentation: ResultPresentation | null = null;
const advanceTimer = new PausableDelay();
const benchTooltip = new BenchTooltip(
  app,
  (uid) => me().pieces.find((p) => p.uid === uid && p.position === null),
  () => game.combatVersion,
  () => catalogVersion(game),
);
const me = () => game.players[0];
const disabled = (condition: boolean) => (condition ? "disabled" : "");
const stars = (n: number) => "★".repeat(n);
function token(p: Piece | Fighter, enemy = false) {
  const u = UNIT[p.defId];
  const fighter = "hp" in p ? p : null;
  return `<span class="piece ${enemy ? "enemy" : ""} ${fighter?.flash ? "flash" : ""}" style="--unit:${u.color}"><img class="unit-portrait" src="${spriteUrl(fighter ? fighterSprite(fighter) : unitSprite(p.defId, game.combatVersion, p.star))}" alt="${u.name}" draggable="false"><span class="piece-name">${u.name}</span><span class="stars">${stars(p.star)}</span>${fighter ? `<span class="health"><i style="width:${Math.max(0, (fighter.hp / fighter.maxHp) * 100)}%"></i></span>` : ""}</span>`;
}
function render() {
  app
    .querySelectorAll<HTMLDetailsElement>("details[data-disclosure]")
    .forEach((detail) => {
      disclosures.set(detail.dataset.disclosure!, detail.open);
    });
  dialogs.beforeRender();
  document.documentElement.dataset.reducedMotion = String(
    preferences.reducedMotion,
  );
  saveCurrent(false);
  benchTooltip.hide();
  scene?.destroy();
  const p = me(),
    busy =
      game.phase !== "prepare" || saveConflict || computing || !!demoBattle,
    fighting = game.phase === "battle" && result !== null,
    done = game.phase === "finished";
  const lastWinner = result
    ? result.battle.winner
    : game.history.at(-1)?.winner;
  const reportMessage = done
    ? "本局已结束，可查看战报、最终阵容与装备，或开始新演习。"
    : game.message;
  const chosen = p.pieces.find((x) => x.uid === selected),
    onboard = p.pieces.filter((x) => x.position !== null),
    bench = p.pieces.filter((x) => x.position === null);
  const shownBattle = demoBattle ?? (fighting ? result?.battle : null);
  const analyzableBattle = demoBattle ?? result?.battle;
  const previousRoundAnalysis =
    !analyzableBattle && game.phase === "prepare" && !saveConflict
      ? game.history.at(-1)
      : undefined;
  const canAnalyzeBattle = !!(analyzableBattle || previousRoundAnalysis);
  const battleAnalysisLabel = previousRoundAnalysis ? "上轮分析" : "战斗分析";
  const reportAnalysisLabel = previousRoundAnalysis ? "上轮分析" : "完整分析";
  const reportAnalysisAria = previousRoundAnalysis
    ? `查看第 ${previousRoundAnalysis.round} 回合战斗分析`
    : "查看完整战斗分析";
  const sceneBattle =
    demoBattle ??
    (["battle", "result", "finished"].includes(game.phase)
      ? (result?.battle ?? null)
      : null);
  if (battleInspection.battle !== sceneBattle)
    battleInspection = { battle: sceneBattle, uid: null };
  const fighters = shownBattle
    ? shownBattle.frames[
        Math.min(Math.floor(playbackTime), shownBattle.frames.length - 1)
      ].fighters
    : [];
  const demoPieces: Piece[] = demoBattle
    ? demoBattle.frames[0].fighters
        .filter((f) => (f.homeSide ?? f.side) === 0 && !f.summon)
        .map((f) => ({
          uid: f.uid,
          defId: f.defId,
          star: f.star,
          position: f.y * 8 + f.x,
        }))
    : [];
  const demoVersion = replayRound
    ? (game.history.find((h) => h.round === replayRound)?.combatVersion ??
      game.combatVersion)
    : CURRENT_COMBAT_VERSION;
  const active = synergies(
    demoBattle ? demoPieces : p.pieces,
    demoBattle ? demoVersion : game.combatVersion,
  );
  const ranked = rankings(game);
  const saveMarkup = currentSaveNotice();
  renderedSaveNotice = saveMarkup;
  app.innerHTML = `<div class="shell" data-mobile-view="${mobileView}"><header class="game-toolbar${saveMarkup ? " has-save-notice" : ""}"><a class="brand" href="/" aria-label="赤潮战术演习主页"><span class="brand-mark">赤</span><span>赤潮 <b>RED TIDES</b><small>战 争 艺 术 / AUTO CHESS</small></span></a><div class="mode"><i></i>单人演习 <span>${DIFFICULTIES[game.difficulty].name} · 你 + 7 位 AI</span></div>${!demoBattle ? rotationMarkup(game) : ""}<div class="round"><small>回合</small><strong>${String(replayRound ?? game.round).padStart(2, "0")}</strong><span>/ ${RULES.maxRounds}</span></div><div class="phase"><span class="phase-dot"></span>${demoBattle ? (replayRound ? "历史回放" : "战斗演示") : { prepare: "准备阶段", battle: "自动战斗", result: game.reward ? "选择战利品" : "回合结算", finished: "最终战报" }[game.phase]}<small class="battle-clock">${demoBattle ? `${(frame * RULES.tickSeconds).toFixed(1)}s` : fighting ? `${(frame * RULES.tickSeconds).toFixed(1)}s` : ""}</small></div><span class="toolbar-save-host" data-save-notice-host>${saveMarkup}</span><button class="mobile-tools-toggle" data-action="mobile-tools" aria-controls="game-tools" aria-expanded="${mobileToolsOpen}">菜单</button><nav id="game-tools" aria-label="演习工具"><button data-jump="recruitment">招募</button>${
    demoBattle
      ? `<button data-action="demo" ${disabled(computing || fighting || game.phase === "result")}>${replayRound ? "退出回放" : "退出演示"}</button>`
      : `<details class="demo-menu"><summary data-focus="demo-menu">战斗演示</summary><div class="demo-options">${[
          ["demo", "十对十兵种"],
          ["summon-demo", "召唤卫阵"],
          ["insect-demo", "异虫蜂群"],
          ["wild-demo", "猛禽陆行"],
          ["rider-demo", "骑射编队"],
          ["armor-demo", "装甲爆破"],
          ["axe-demo", "傀儡刺杀"],
          ["sword-demo", "傀儡先锋"],
          ["blade-demo", "傀儡战刃"],
          ["shield-demo", "傀儡卫阵"],
          ["staff-demo", "疾风棍阵"],
          ["beast-demo", "野兽破阵"],
          ["lingjiu-demo", "海神刺杀"],
          ["wildfront-demo", "荒原先锋"],
          ["assassin-demo", "六刺突袭"],
          ["counterplay-demo", "狙骑反制"],
          ["abnormal-demo", "异能续战"],
          ["coalition-demo", "空援协同"],
          ["aurora-demo", "极光成长"],
          ["taotie-demo", "饕餮狂暴"],
          ["tar-demo", "焦油爆破"],
          ["lightning-demo", "雷神锁链"],
          ["gospel-demo", "福音供能"],
          ["thunderstorm-demo", "雷暴削能"],
          ["jungle-demo", "丛林震荡"],
          ["wushi-demo", "武僧无式"],
          ["shuriken-demo", "风魔飞镖"],
          ["terminator-demo", "终结者轰炸"],
          ["warcry-demo", "战吼石化"],
          ["tornado-demo", "龙卷穿阵"],
          ["wildfire-demo", "燎原涅槃"],
          ["boneblast-demo", "骨球震爆"],
          ["thornbind-demo", "荆棘汲取"],
          ["siege-demo", "攻城炮台"],
          ["inferno-demo", "炎狱金刚"],
          ["mending-demo", "灵蕴缝合"],
          ["formless-demo", "无形幽灵机"],
          ["support-actions-demo", "隐形支援"],
          ["dream-demo", "迷梦蛛丝"],
          ["equipment-skills-demo", "装备主动技能"],
          ["whale-eye-demo", "海雾回能"],
          ["detonation-demo", "囊爆连锁"],
          ["execution-demo", "刑杀勾魂"],
          ["tortoise-shell-demo", "玄龟守御"],
          ["tortoise-breach-demo", "玄龟破壳"],
          ["spirit-ward-demo", "灵鹿庇护"],
          ["bulwark-demo", "盾阵护卫"],
          ["hive-demo", "蜂群双环"],
          ["gaze-demo", "凝视压制"],
          ["rifle-demo", "步枪火力"],
          ["bombardment-demo", "集团轰炸"],
          ["secret-orb-demo", "秘法削能"],
          ["secret-orb-counter-demo", "秘法反制"],
          ["immortal-demo", "灵能不朽"],
          ["airsea-demo", "空海舰队"],
        ]
          .map(
            ([action, label]) =>
              `<button data-action="${action}" ${disabled(computing || fighting || game.phase === "result")}>${label}</button>`,
          )
          .join("")}</div></details>`
  }<button data-action="codex">棋子图鉴</button><button data-action="history">本局战报</button><button data-action="help">作战指南</button><button data-action="settings">设置</button><button data-action="debug" title="按 / 输入兵种指令">后台模式${game.debugShopQueue?.length ? ` · ${game.debugShopQueue.length}` : ""}</button><button data-action="restart">重新开始</button></nav><button class="primary start" data-action="next" ${disabled(!!demoBattle || computing || saveConflict || !!game.reward || fighting || (!onboard.length && !done && game.phase === "prepare"))}>${computing ? "正在计算…" : game.phase === "battle" && !result ? "恢复战斗" : done ? "开始新演习" : game.phase === "result" ? (game.reward ? "选择战利品" : "下一回合 →") : "开始战斗 →"}</button></header>
 ${computing || computeError ? `<section class="compute-status" role="status" aria-live="polite"><span>${computing ? pendingJob?.label : computeError}</span><div>${!computing ? '<button data-action="retry-compute">重试计算</button>' : ""}<button data-action="cancel-compute">${computing ? "取消计算" : "关闭"}</button></div></section>` : ""}
 <h1 class="toolbar-title">${demoBattle ? (replayRound ? `第 ${replayRound} 回合 · 战斗回放` : spiritWardDemo ? "灵鹿庇护 · 战术演习" : bulwarkDemo ? "盾阵护卫 · 战术演习" : hiveDemo ? "蜂群双环 · 战术演习" : gazeDemo ? "凝视压制 · 战术演习" : rifleDemo ? "步枪火力 · 战术演习" : thornbindDemo ? "荆棘汲取 · 战术演习" : boneblastDemo ? "骨球震爆 · 战术演习" : wildfireDemo ? "燎原涅槃 · 战术演习" : tornadoDemo ? "龙卷穿阵 · 战术演习" : warcryDemo ? "战吼石化 · 战术演习" : terminatorDemo ? "终结者轰炸 · 战术演习" : bombardmentDemo ? "集团轰炸 · 战术演习" : secretOrbCounterDemo ? "秘法反制 · 战术演习" : secretOrbDemo ? "秘法削能 · 战术演习" : shurikenDemo ? "风魔飞镖 · 战术演习" : wushiDemo ? "武僧无式 · 战术演习" : jungleDemo ? "丛林震荡 · 战术演习": thunderstormDemo ? "雷暴削能 · 战术演习" : gospelDemo ? "福音供能 · 战术演习" : lightningDemo ? "雷神锁链 · 战术演习" : tarDemo ? "焦油爆破 · 战术演习" : taotieDemo ? "饕餮狂暴 · 战术演习" : auroraDemo ? "极光成长 · 战术演习" : coalitionDemo ? "空援协同 · 战术演习" : abnormalDemo ? "异能续战 · 战术演习" : counterplayDemo ? "狙骑反制 · 战术演习" : assassinDemo ? "六刺突袭 · 战术演习" : wildfrontDemo ? "荒原先锋 · 战术演习" : lingjiuDemo ? "海神刺杀 · 战术演习" : beastDemo ? "野兽破阵 · 战术演习" : staffDemo ? "疾风棍阵 · 战术演习" : shieldDemo ? "傀儡卫阵 · 战术演习" : bladeDemo ? "傀儡战刃 · 战术演习" : swordDemo ? "傀儡先锋 · 战术演习" : axeDemo ? "傀儡刺杀 · 战术演习" : armorDemo ? "装甲爆破 · 战术演习" : riderDemo ? "骑射编队 · 战术演习" : wildDemo ? "猛禽陆行 · 战术演习" : immortalDemo ? "灵能不朽 · 战术演习" : airseaDemo ? "空海舰队 · 战术演习" : insectDemo ? "异虫蜂群 · 战术演习" : summonDemo ? "召唤卫阵 · 战术演习" : demoTitle) : done ? "演习结束" : fighting ? "交战进行中" : game.phase === "result" ? "战斗结算" : "赤潮战术演习"}</h1>
 ${!demoBattle ? matchSummaryMarkup(game) : ""}
 <main><aside class="left"><section class="panel commander" id="commander"><span class="eyebrow">COMMANDER</span><label class="difficulty-setting">难度<select data-difficulty aria-label="单机难度" title="仅在第 1 回合开战前选择难度" ${disabled(game.round !== 1 || busy || !!demoBattle)}>${Object.entries(
   DIFFICULTIES,
 )
   .map(
     ([key, d]) =>
       `<option value="${key}" ${game.difficulty === key ? "selected" : ""}>${d.name}</option>`,
   )
   .join(
     "",
   )}</select></label><p class="difficulty-hint">${DIFFICULTIES[game.difficulty].description}</p><h2>指挥官 <span>01</span></h2><div class="vitals"><strong>${p.hp}<small>生命值</small></strong><strong class="gold">${p.gold}<small>金币</small></strong></div><div class="life"><i style="width:${p.hp}%"></i></div><div class="level"><span>等级 <b>${p.level}</b></span><span>${p.level === 10 ? "MAX" : `${p.xp} / ${XP[p.level]} XP`}</span></div><div class="xp"><i style="width:${p.level === 10 ? 100 : (p.xp / XP[p.level]) * 100}%"></i></div><button class="wide" data-action="xp" ${disabled(busy || p.gold < 5 || p.level === 10)}>购买经验 <span>5 金 / 5 XP</span></button>${incomeMarkup(game.round)}<p class="micro">预计利息 +${Math.min(5, Math.floor(p.gold / 10))} 金 · ${p.streak >= 0 ? "连胜" : "连败"} ${Math.abs(p.streak)}</p></section>
 ${equipmentMarkup(game, selected, busy || !!demoBattle)}
 </aside>
 <div class="battle-column"><section class="arena" id="battlefield"><div class="arena-label"><span><i class="red-dot"></i>${fighting ? result!.opponent.name : "敌方阵地"}</span><span>${fighting ? "实时战况" : "8 × 8 战术棋盘"} <button class="speed" data-action="speed">${speed}×</button></span></div><div class="battle-viewport"><div class="battle-stage ${demoBattle ? "is-demo" : ""}"><canvas id="battle-canvas" role="img" aria-label="斜俯视战场：点击己方棋格部署选中的棋子"></canvas><div class="stage-title"><span>云海遗迹</span><small>THE CLOUD SANCTUARY</small></div><div class="stage-status">${demoBattle ? (replayRound ? "历史回放 · 不影响当前对局" : "兵种演示 · 不影响当前对局") : fighting ? "交战中" : game.phase === "result" ? "战果展示 · 即将进入准备" : done ? "演习结束" : "部署阶段 · 己方半场可落子"}</div>${resultMarkup(resultPresentation)}</div></div>
 <div class="arena-bottom"><div class="stage-controls"><button data-action="pause" ${disabled(!fighting && !demoBattle)}>${paused ? "继续播放" : "暂停画面"}</button><button data-action="speed">${speed}× 速度</button><button data-action="battle-analysis" ${disabled(computing || !canAnalyzeBattle)}>${battleAnalysisLabel}</button></div><span><i class="teal-dot"></i>己方阵地</span><span>${demoBattle ? `${replayRound ? "回放" : "演示"}阵容 <b>${demoPieces.length} 枚</b>` : `已部署 <b>${onboard.length} / ${p.level}</b>`}</span></div>
 <div class="bench-header"><span>备战席 <small>${bench.length} / 8</small></span><span>${sceneBattle ? "点击棋子查看战斗状态" : chosen ? `已选择 ${UNIT[chosen.defId].name}` : "点击棋子选择 · 点击棋格部署"}</span></div><div class="bench">${Array.from(
   { length: 8 },
   (_, i) => {
     const x = bench[i];
     return `<div class="bench-item" ${x ? `data-bench-info="${x.uid}" tabindex="${busy ? 0 : -1}"` : ""}><button class="bench-slot ${x?.uid === selected ? "selected" : ""}" data-bench="${x?.uid ?? ""}" ${disabled(busy)} aria-label="${x ? UNIT[x.defId].name : "空备战位置"}">${x ? token(x) : `<span>${String(i + 1).padStart(2, "0")}</span>`}</button>${x ? `<button class="bench-info" data-piece-info="${x.uid}" aria-label="查看备战席${UNIT[x.defId].name}详情">详情</button>` : ""}</div>`;
   },
 ).join("")}</div>
 <div class="formation-tools">${deploymentMarkup(p, selected, busy || !!demoBattle, deploymentOpen, game.combatVersion)}<div class="auto-deploy"><button data-action="auto-deploy" ${disabled(busy || !!demoBattle || !p.pieces.length)}>推荐布阵</button><button data-action="compact-deploy" ${disabled(busy || !!demoBattle || !p.pieces.length)}>抱团布阵</button><span class="micro">分散避群伤，抱团保护后排；均可继续手动调整</span></div></div><div class="selection ${chosen ? "has-selection" : ""}">${chosen ? `<span><b>${UNIT[chosen.defId].name}</b> ${stars(chosen.star)} · ${unitDefinition(chosen.defId, chosen.definitionVersion??game.combatVersion).traits.join(" / ")}</span><div><button data-action="deselect" aria-keyshortcuts="Escape" title="取消选择（Esc）">取消选择</button><button data-action="unit-info">查看详情</button><button data-action="recall" ${disabled(busy || chosen.position === null)}>撤回备战席</button><button data-action="sell" ${disabled(busy)}>出售 +${salePrice(chosen, catalogVersion(game))} 金</button></div>` : "<span>招募 → 布阵 → 自动交战 → 升级阵容</span>"}</div><p class="mobile-feedback" role="status">${sceneBattle ? "点击战场棋子查看状态与羁绊效果。" : reportMessage}</p></section>
 ${recruitmentMarkup(game, p, busy)}<button class="mobile-shop-return" data-jump="battlefield">返回战场布阵 <span>备战 ${bench.length} / 8 →</span></button></div>
 <aside class="right command-deck" id="intel"><section class="panel leaderboard"><div class="section-label"><h2>战场情报</h2><span>${game.players.filter((x) => x.hp > 0).length} / 8 存活</span></div><div class="player-grid">${ranked.map((x, i) => `<div class="player ${x.id === 0 ? "you" : ""} ${x.hp === 0 ? "eliminated" : ""}"><span class="rank">${String(i + 1).padStart(2, "0")}</span><div class="player-identity"><b title="${x.name}">${x.name}</b>${x.id !== 0 ? `<small class="player-doctrine">${profileFor(x).name}</small>` : ""}<span class="player-bar"><i style="width:${x.hp}%"></i></span></div><strong>${x.hp}</strong>${x.id !== 0 ? `<button class="scout-button" data-scout="${x.id}" aria-label="侦察 ${x.name}" title="侦察 ${x.name} · ${profileFor(x).name}">侦察</button>` : ""}</div>`).join("")}</div></section><section class="panel report"><div class="section-label"><h2>${fighting || demoBattle ? "战斗贡献" : done ? `最终排名 #${ranked.findIndex((x) => x.id === 0) + 1}` : "作战简报"}</h2><button class="report-analysis" data-action="battle-analysis" aria-label="${reportAnalysisAria}" ${disabled(computing || !canAnalyzeBattle)}>${reportAnalysisLabel}</button></div><div class="damage-stats">${
   fighting || demoBattle
     ? fighters
         .filter((f) => (f.homeSide ?? f.side) === 0)
         .sort((a, b) => b.damage - a.damage)
         .slice(0, 5)
         .map(
           (f) =>
             `<div class="damage"><span>${fighterName(f)}<small>${f.spiritWard ? `防护减伤 ${f.spiritWard.mitigated}` : `治疗 ${f.healing} · 承盾 ${f.absorbed}`}</small></span><b>${f.damage}</b></div>`,
         )
         .join("")
     : `<p role="status">${reportMessage}${game.phase === "prepare" ? reserveEquipmentHint(p) : ""}</p>`
 }</div>${game.phase === "result" ? `<p class="result-badge">${lastWinner === 0 ? "防守胜利" : lastWinner === null ? "战斗平局" : "防守失败"}</p>` : ""}${!demoBattle && !done ? encounterMarkup(game) : ""}</section><section class="panel synergies">${synergyPanelMarkup(active, !!demoBattle)}</section></aside></main>
 <footer><span>RED TIDES / 战术演习</span><span class="save-status" role="status">${saveLabel()}</span><span>ImageGen 重制形象 · 2.5D 战场</span></footer><nav class="mobile-dock" aria-label="快捷导航"><span>${p.hp} 生命 · <b>${p.gold} 金</b> · ${onboard.length}/${p.level} 人口</span><div><a href="#battlefield" data-jump="battlefield" aria-controls="battlefield">战场</a><a href="#recruitment" data-jump="recruitment" aria-controls="recruitment">招募</a><a href="#armory" data-jump="armory" aria-controls="armory">装备</a><a href="#commander" data-jump="commander" aria-controls="commander">升级</a><a href="#intel" data-jump="intel" aria-controls="intel">情报</a></div></nav></div>
 ${restartOpen ? restartMarkup(game) : ""}
 ${game.reward && !restartOpen && !computing && !resultPresentation && !saveConflict && !settingsOpen && !debugOpen && !unitInfo && scoutId === null && !historyOpen && !help && !codex && !analysisView && !equipmentOverviewOpen ? rewardMarkup(game) : ""}
 ${analysisView ? battleAnalysisMarkup(analyzeBattle(analysisView.battle, analysisView.at), analysisMetric, analysisView.title, analysisView.limit, analysisView.battle.frames[analysisView.limit]?.tick ?? 0, analysisView.battle === demoBattle) : ""}
 ${equipmentOverviewOpen ? equipmentOverviewMarkup(game, equipmentHeldOnly) : ""}
 ${settingsOpen ? settingsMarkup(preferences) : ""}
 ${debugOpen ? debugShopMarkup(game, !canEditDebugShop(), debugCommand, debugNotice, debugQuantity) : ""}
 ${unitInfo ? pieceInfoMarkup(unitInfo, unitInfoVersion ?? game.combatVersion, catalogVersion(game), unitInfoFinal) : ""}
 ${scoutId !== null ? scoutingMarkup(game, scoutId) : ""}
 ${historyOpen ? historyMarkup(game) : ""}
 ${help || codex ? `<div class="modal-backdrop"><section class="modal manual-modal" role="dialog" aria-modal="true" aria-label="${help ? "作战指南" : "棋子图鉴"}"><header class="manual-header"><div><span class="eyebrow">FIELD MANUAL</span><h2>${help ? "作战指南" : "棋子图鉴"}</h2></div><button class="close" data-action="close" aria-label="关闭">×</button></header><div class="manual-body">${help ? `<ol><li>新开比赛系统随机禁用3个种族系列，玩家与AI共用剩余卡池，整场不变。双种族命中任一禁用系列即不可招募。展开“本局禁用”可查看棋子与羁绊影响；图鉴可筛选本局可招募棋子。旧局保留原费用与禁用结果；版本新增兵种按相同禁用规则加入。</li><li>在招募中心购买棋子。通常 3 个同星同名棋子自动合成，最高三星。持有 2 种异虫时，一星异虫只需 2 枚；持有 4 种时，二星也只需 2 枚。异虫种类包含备战席。异虫售价按常规星级价值计算、上限 5 金，卡池只返还实际使用份数。</li><li>点击备战席中的棋子，再点击棋盘下半区部署。上场数量不能超过等级。</li><li>点击场上棋子后可移动、交换、撤回或出售。重复棋子不增加羁绊计数。</li><li>点击开始战斗，观察走位与伤害。战斗期间不能更改阵容。</li><li>每轮基础奖励从5金开始，每5回合增加2金，最高15金；利息、对战胜利和连胜或连败奖励另算，玩家与AI使用相同规则。后期可用更多金币刷新、追星或购买经验提升人口。</li><li>存活到最后获胜；第 30 回合按剩余生命排名。重新开始会清空本局。</li></ol><p>本版包含 ${UNITS.length} 种棋子、22 类羁绊与多档效果和共享卡池。棋子各有独立技能：护盾、治疗、眩晕、破甲、贯穿和突袭。飞行属性独立于空军羁绊，巨神炮优先对空。展开阵容连携可查看该局的门槛、累计总量和受益对象，图鉴也列出全部效果。方舟蓄力和电蛟雷场有范围预告，控制可中断施法。蓝色条为护盾，紫色数字为法术伤害。不朽棋子能在阵亡后以残魂继续战斗，剩余时间用青色倒计时显示，无法治疗或获得护盾；残魂不增加战后扣血。灵能受击反伤的具体数值与受益范围见连携详情，残魂和召唤物同样生效；反伤不连锁、不回能。童子可为邻近主力充能，战斗分析单列反伤与供能。猛禽和空军连携关注飞行状态，血鹰落地后效果可能改变。${hasCoalitionRules(game.combatVersion) ? "陆行者只上阵一种时普攻为真实伤害，多种同时上阵会显示冲突；同名重复仍算一种。" : "陆行者的普攻可转为真实伤害，具体效果见连携详情。"}声波持续伤害、罗汉蓄力和蛤蟆吞噬可在阵容演示中观察。${hasTaotieRules(game.combatVersion) ? "飞天蛤蟆的饕餮具有星级冷却，成功吞噬后回血并获得8秒攻击狂暴；新比赛为五费，已有比赛保留原价格和卡池份数。" : ""}${hasQiRules(game.combatVersion) ? "罗汉的气波掌蓄力1秒、冷却10秒，技能伤害与陆行者普攻真伤分别结算；战斗分析会标出动作中断或目标丢失。" : ""}${hasAuroraRules(game.combatVersion) ? "空蟹的极光电影有13秒冷却，每次施放后攻击增加25%，最多三层；极光成长演示可查看叠层、攻击与剩余冷却。" : ""}${hasLightningRules(game.combatVersion) ? "雷震子的普通攻击会弹射物理雷电，攻击、攻速、吸血和狙击穿透都可增益；不需要能量或技能强度。" : ""}${hasTarRules(game.combatVersion) ? "摩托骑兵会分批投放焦油弹，焦油弹黏附目标并有3秒倒计时；分散站位和及时打断投弹可以减少溅射伤害。" : ""}操作后自动保存本局，刷新可恢复战斗与准备进度。本局战报可查看已结束回合与回放，并打开双方战斗分析。战场上的“战斗分析”会暂停播放，只统计已播放片段，可比较伤害、承伤、治疗和护盾贡献。野怪回合后选择装备；选中棋子后可在装备工坊穿戴、卸下或合成。每枚棋子最多 3 件装备，升星溢出装备和出售装备会归还库存。首轮开战前可选择休闲、标准或挑战难度；新开局根据剩余卡池，从${AI_PROFILES.length - 1}种构筑风格中选择仍可构筑的偏好分配给7名AI，可能重复；同一对手在本局内保持风格。战场情报会显示风格，侦察按钮可查看对手站位与装备。推荐布阵可自动挑选阵容并安排前后排。</p>` : codexMarkup(game)}</div></section></div>` : ""}`;
  app
    .querySelectorAll<HTMLDetailsElement>("details[data-disclosure]")
    .forEach((detail) => {
      detail.open = disclosures.get(detail.dataset.disclosure!) ?? false;
    });
  syncMobileNavigation();
  scene = new BattleScene(
    document.querySelector<HTMLCanvasElement>("#battle-canvas")!,
    () => ({
      pieces: me().pieces,
      version: demoBattle ? demoVersion : game.combatVersion,
      selected,
      battle: sceneBattle,
      inspected:
        battleInspection.battle === sceneBattle ? battleInspection.uid : null,
      time: playbackTime,
      phase: demoBattle ? "demo" : game.phase,
      demo: !!demoBattle,
      paused,
    }),
    selectCell,
    () => preferences,
    (uid) => {
      battleInspection = { battle: sceneBattle, uid };
    },
  );
  if (computing)
    app
      .querySelectorAll<HTMLButtonElement>(
        "[data-watch-round], [data-analyze-round]",
      )
      .forEach((button) => {
        button.disabled = true;
      });
  dialogs.afterRender();
}
function message(text: string) {
  game.message = text;
}
function stopTimer() {
  audio.stop();
  if (timer) clearInterval(timer);
  timer = undefined;
}
function saveLabel() {
  return {
    saved: "本局已自动保存",
    migrated: "存档已升级",
    empty: "自动存档已就绪",
    recovered: "已从备份恢复",
    damaged: "存档校验失败 · 暂未保存",
    incompatible: "存档版本不兼容 · 本局暂不保存",
    unavailable: "本局暂未保存 · 可在顶部重试",
    conflict: "另一窗口已更新 · 等待载入",
  }[saves.status];
}
function currentPlayback(): PlaybackSave {
  return {
    time: game.phase === "battle" && !demoBattle ? playbackTime : 0,
    speed: speed as PlaybackSave["speed"],
    paused: game.phase === "battle" && paused,
  };
}
function currentSaveNotice() {
  return saveNoticeMarkup(saveNotice,saveConflict,{
    status:saves.status,needsProtection:saves.needsProtection,
    hasPreservedData:saves.hasPreservedData,busy:computing,
  });
}
function syncSaveNotice() {
  const host=app.querySelector<HTMLElement>("[data-save-notice-host]");
  const markup=currentSaveNotice();
  if(!host||markup===renderedSaveNotice)return;
  const open=host.querySelector<HTMLDetailsElement>("details")?.open??disclosures.get("save-notice")??false;
  const focused=host.contains(document.activeElement);
  host.innerHTML=markup;
  const details=host.querySelector<HTMLDetailsElement>("details");
  if(details)details.open=open;
  app.querySelector(".game-toolbar")?.classList.toggle("has-save-notice",!!markup);
  if(focused)(details?.querySelector<HTMLElement>("summary")??app.querySelector<HTMLElement>(".brand"))?.focus({preventScroll:true});
  renderedSaveNotice=markup;
}
function handleSaveStatus(status: ReturnType<SaveStore["save"]>) {
  lastSaveAt = Date.now();
  if (status === "conflict") {
    cancelComputation();
    saveConflict = true;
    paused = true;
    stopTimer();
    advanceTimer.cancel();
  }
  const label = document.querySelector(".save-status");
  if (label) label.textContent = saveLabel();
}
function saveCurrent(updateNotice=true) {
  if (saveConflict) return "conflict" as const;
  const status=saves.save(game,currentPlayback());
  handleSaveStatus(status);
  if(updateNotice)syncSaveNotice();
  return status;
}
function reset() {
  cancelComputation();
  saves.allowReplacement();
  saveConflict = false;
  saveNotice = "";
  closePanels();
  debugCommand = "/";
  debugQuantity = "1";
  debugNotice = null;
  deploymentOpen = false;
  mobileView = "battlefield";
  replayRound = null;
  resultPresentation = null;
  advanceTimer.cancel();
  stopTimer();
  demoBattle = null;
  paused = false;
  playbackTime = 0;
  game = createGame(Date.now() >>> 0);
  selected = null;
  result = null;
  frame = 0;
  render();
}
function focusMatchSummary() {
  app.querySelector<HTMLElement>(".match-summary")?.focus();
}
function finish() {
  stopTimer();
  if (!result || game.phase !== "battle" || saveConflict) return;
  const previousHp = me().hp,
    previousGold = me().gold;
  settle(game, result);
  audio.play(
    result.battle.winner === 0
      ? "win"
      : result.battle.winner === 1
        ? "loss"
        : "draw",
  );
  selected = null;
  const settledPhase = (game as Game).phase;
  resultPresentation = {
    winner: result.battle.winner,
    startedAt: performance.now(),
    round: game.round,
    damage: previousHp - me().hp,
    income: me().gold - previousGold,
    terminal: settledPhase === "finished",
    rewardPending: !!game.reward,
    rank: rankings(game).findIndex((p) => p.id === 0) + 1,
  };
  if (settledPhase === "result") {
    game.message += game.reward
      ? " 战果展示后选择战利品。"
      : " 战果展示后自动进入下一回合准备。";
    advanceTimer.cancel();
    advanceTimer.schedule(advanceRound, RESULT_DURATION_MS);
  }
  render();
  if (settledPhase === "finished") focusMatchSummary();
}
function advanceRound() {
  advanceTimer.cancel();

  if (game.phase !== "result" || saveConflict) return;
  resultPresentation = null;
  if (game.reward) {
    render();
    return;
  }
  stopTimer();
  demoBattle = null;
  nextRound(game);
  result = null;
  playbackTime = 0;
  frame = 0;
  paused = false;
  render();
}
function cancelComputation() {
  computationId++;
  computer.cancel();
  computing = false;
  pendingJob = null;
  computeError = "";
}
function runComputation(
  job: ComputeJob,
  apply: (value: ComputeResult) => void,
  label: string,
) {
  const id = ++computationId;
  pendingJob = { job, apply, label };
  computing = true;
  computeError = "";
  stopTimer();
  render();
  if (saveConflict || id !== computationId) return;
  void computer
    .run(job)
    .then((value) => {
      if (id !== computationId || saveConflict) return;
      computing = false;
      pendingJob = null;
      apply(value);
      render();
      if (game.phase === "finished") focusMatchSummary();
    })
    .catch((error) => {
      if (id !== computationId || error instanceof ComputationCancelled) return;
      computing = false;
      computeError =
        error instanceof Error ? error.message : "计算失败，请重试。";
      render();
    });
}
function calculateRound(mode: "start" | "resume") {
  if (mobileViewport.matches) showMobileView("battlefield");
  const restoring = mode === "resume";
  runComputation(
    { kind: mode, game },
    (value) => {
      if (value.kind !== "round") return;
      game = value.game;
      result = value.result;
      demoBattle = null;
      resultPresentation = null;
      selected = null;
      saveNotice = "";
      if (!restoring) {
        playbackTime = 0;
        paused = false;
      }
      playbackTime = Math.min(
        playbackTime,
        result.battle.frames.length - 1 + 5,
      );
      frame = Math.min(
        Math.floor(playbackTime),
        result.battle.frames.length - 1,
      );
      beginPlayback();
    },
    restoring ? "正在恢复本轮战斗…" : "正在安排对手与战斗…",
  );
}
function closePanels() {
  const wasRestartOpen = restartOpen;
  restartOpen = false;
  equipmentOverviewOpen = false;
  mobileToolsOpen = false;
  analysisView = null;
  scoutId = null;
  historyOpen = false;
  help = false;
  codex = false;
  settingsOpen = false;
  debugOpen = false;
  unitInfo = null;
  unitInfoVersion = null;
  unitInfoFinal = false;
  if (wasRestartOpen) syncVisibility();
}
function canEditDebugShop() {
  return game.phase === "prepare" && me().hp > 0 && !computing && !saveConflict && !demoBattle && !game.reward;
}
function focusDebugCommand() {
  const input = app.querySelector<HTMLInputElement>('[data-focus="debug-command"]');
  input?.focus({ preventScroll: true });
  input?.setSelectionRange(input.value.length, input.value.length);
}
function openDebugShop(command?: string) {
  closePanels();
  debugOpen = true;
  debugNotice = null;
  if (command !== undefined) debugCommand = command;
  render();
  focusDebugCommand();
}
function submitDebugCommand() {
  if (!debugOpen || !canEditDebugShop()) return;
  debugNotice = queueShopCommand(game, debugCommand, Number(debugQuantity));
  if (debugNotice.ok) debugCommand = "/";
  render();
  focusDebugCommand();
}
function openBattleAnalysis(battle: Battle, limit: number, title: string) {
  closePanels();
  paused = true;
  audio.stop();
  const last = Math.max(
    0,
    Math.min(Math.floor(limit), battle.frames.length - 1),
  );
  analysisView = { battle, at: last, limit: last, title };
  analysisMetric = "damage";
}
function updateSoundStatus() {
  const status = app.querySelector(".sound-status");
  if (status) status.textContent = audio.status;
}
for (const event of ["pointerdown", "keydown"] as const) {
  app.addEventListener(
    event,
    () => {
      void audio.unlock().then(updateSoundStatus);
    },
    { capture: true },
  );
}
app.addEventListener("click", (e) => {
  app
    .querySelectorAll<HTMLDetailsElement>(".game-toolbar > details[open]")
    .forEach((popup) => {
      if (!popup.contains(e.target as Node)) popup.open = false;
    });
  const origin =
    e.target instanceof Element
      ? e.target
      : e.target instanceof Node
        ? e.target.parentElement
        : null;
  const target = origin?.closest<HTMLElement>("button, a[data-jump]");
  if (!target || target.hasAttribute("disabled")) return;
  if (
    target.dataset.jump &&
    mobileViews.includes(target.dataset.jump as MobileView)
  ) {
    e.preventDefault();
    if (mobileViewport.matches)
      showMobileView(target.dataset.jump as MobileView);
    else
      document.getElementById(target.dataset.jump)?.scrollIntoView({
        behavior: preferences.reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    return;
  }
  const p = me(),
    action = target.dataset.action;
  if (action === "mobile-tools") {
    mobileToolsOpen = !mobileToolsOpen;
    syncMobileNavigation();
    return;
  }
  if (target.closest("#game-tools") && action) mobileToolsOpen = false;
  if (action === "codex-reset" && codex) {
    resetCodex(app, game);
    return;
  }
  if (action === "cancel-compute") {
    cancelComputation();
    if (demoBattle) beginPlayback();
    render();
    return;
  }
  if (action === "retry-compute" && pendingJob) {
    const { job, apply, label } = pendingJob;
    runComputation(job.kind==="deploy"?{...job,game}:job, apply, label);
    return;
  }
  if (
    computing &&
    ![
      "settings",
      "debug",
      "help",
      "codex",
      "history",
      "close",
      "restart",
      "confirm-restart",
      "load",
      "sound-preview",
      "unit-info",
      "equipment-overview",
      "equipment-all",
      "equipment-held",
      "deployment",
      "dismiss-notice",
      "export-old-save",
    ].includes(action ?? "") &&
    !target.dataset.jump &&
    !target.dataset.scout &&
    !target.dataset.unitInfo &&
    !target.dataset.equipmentOwner &&
    !target.dataset.pieceInfo
  )
    return;
  if (action === "sound-preview") {
    void audio.unlock().then((ready) => {
      if (ready) audio.play("reward");
      updateSoundStatus();
    });
    return;
  }
  if (action === "load") {
    window.location.reload();
    return;
  }
  if (action === "export-old-save") {
    const raw=saves.exportOldSaves();
    if(raw===null)saveNotice="旧档暂时无法导出，请检查浏览器存储权限后重试。";
    else {
      const url=URL.createObjectURL(new Blob([raw],{type:"application/json"}));
      const link=document.createElement("a");
      link.href=url;link.download=`red-tides-old-saves-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
      document.body.append(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      saveNotice="已发起旧档与备份文件下载。";
    }
    syncSaveNotice();
    return;
  }
  if (
    saveConflict &&
    ![
      "help",
      "codex",
      "history",
      "settings",
      "debug",
      "unit-info",
      "equipment-overview",
      "equipment-all",
      "equipment-held",
      "deployment",
      "close",
      "dismiss-notice",
    ].includes(action ?? "") &&
    !target.dataset.unitInfo &&
    !target.dataset.equipmentOwner &&
    !target.dataset.scout &&
    !target.dataset.pieceInfo
  )
    return;
  if (action === "protect-save") {
    const status=saves.protectAndSave(game,currentPlayback());
    handleSaveStatus(status);
    saveNotice=status==="saved"?"旧存档已保留，本局已启用自动保存。"
      :status==="conflict"?"旧存档保留期间，另一窗口更新了进度。"
      :"旧档保留尚未完成，本局仍未保存。可导出旧档，检查浏览器存储空间后重试。";
    if(saveConflict)render();else syncSaveNotice();
    return;
  }
  if (action === "retry-save") {
    const status=saveCurrent();
    saveNotice=status==="saved"?"本局已恢复自动保存。":"仍未保存成功，请检查浏览器存储空间与权限后重试。";
    if(saveConflict)render();else syncSaveNotice();
    return;
  }
  if (action === "deployment") deploymentOpen = !deploymentOpen;
  if (
    action === "analysis-frame" &&
    analysisView?.battle === demoBattle &&
    demoBattle
  ) {
    playbackTime = analysisView.at;
    frame = Math.floor(playbackTime);
    closePanels();
    resultPresentation = null;
    paused = true;
    beginPlayback();
  }
  if (
    action === "analysis-replay" &&
    analysisView?.battle === demoBattle &&
    demoBattle
  ) {
    closePanels();
    resultPresentation = null;
    playbackTime = 0;
    frame = 0;
    paused = false;
    beginPlayback();
  }
  if (action === "battle-analysis") {
    const battle = demoBattle ?? result?.battle;
    if (battle)
      openBattleAnalysis(
        battle,
        playbackTime,
        demoBattle
          ? replayRound
            ? `第 ${replayRound} 回合回放`
            : spiritWardDemo ? "灵鹿庇护演习" : bulwarkDemo ? "盾阵护卫演习" : hiveDemo ? "蜂群双环演习" : gazeDemo ? "凝视压制演习" : rifleDemo ? "步枪火力演习" : thornbindDemo ? "荆棘汲取演习" : boneblastDemo ? "骨球震爆演习" : wildfireDemo ? "燎原涅槃演习" : tornadoDemo ? "龙卷穿阵演习" : warcryDemo ? "战吼石化演习" : terminatorDemo ? "终结者轰炸演习" : bombardmentDemo ? "集团轰炸演习" : secretOrbCounterDemo ? "秘法反制演习" : secretOrbDemo ? "秘法削能演习" : shurikenDemo ? "风魔飞镖演习" : wushiDemo ? "武僧无式演习" : jungleDemo ? "丛林震荡演习": thunderstormDemo ? "雷暴削能演习" : gospelDemo
              ? "福音供能演习"
              : lightningDemo
              ? "雷神锁链演习"
              : tarDemo
                ? "焦油爆破演习"
                : taotieDemo
                  ? "饕餮狂暴演习"
                  : auroraDemo
                    ? "极光成长演习"
                    : coalitionDemo
                      ? "空援协同演习"
                      : abnormalDemo
                        ? "异能续战演习"
                        : counterplayDemo
                          ? "狙骑反制演习"
                          : assassinDemo
                            ? "六刺突袭演习"
                            : wildfrontDemo
                              ? "荒原先锋演习"
                              : lingjiuDemo
                                ? "海神刺杀演习"
                                : beastDemo
                                  ? "野兽破阵演习"
                                  : staffDemo
                                    ? "疾风棍阵演习"
                                    : shieldDemo
                                      ? "傀儡卫阵演习"
                                      : bladeDemo
                                        ? "傀儡战刃演习"
                                        : swordDemo
                                          ? "傀儡先锋演习"
                                          : axeDemo
                                            ? "傀儡刺杀演习"
                                            : armorDemo
                                              ? "装甲爆破演习"
                                              : riderDemo
                                                ? "骑射编队演习"
                                                : wildDemo
                                                  ? "猛禽陆行演习"
                                                  : immortalDemo
                                                    ? "灵能不朽演习"
                                                    : airseaDemo
                                                      ? "空海舰队演习"
                                                      : insectDemo
                                                        ? "异虫蜂群演习"
                                                        : summonDemo
                                                          ? "召唤卫阵演习"
                                                          : demoTitle
          : `第 ${game.round} 回合 · ${result!.opponent.name}`,
      );
    else if (game.phase === "prepare" && !computing && !saveConflict) {
      const report = game.history.at(-1);
      if (report) {
        runComputation(
          {
            kind: "replay",
            left: report.left,
            right: report.right,
            version: report.combatVersion,
          },
          (value) => {
            if (value.kind !== "replay") return;
            openBattleAnalysis(
              value.battle,
              value.battle.frames.length - 1,
              `第 ${report.round} 回合 · ${report.opponentName}`,
            );
          },
          `正在准备第 ${report.round} 回合分析…`,
        );
        return;
      }
    }
  }
  if (action === "equipment-overview") {
    closePanels();
    equipmentOverviewOpen = true;
    equipmentHeldOnly = false;
  }
  if (action === "equipment-all") equipmentHeldOnly = false;
  if (action === "equipment-held") equipmentHeldOnly = true;
  if (target.dataset.equipmentOwner) {
    const uid = Number(target.dataset.equipmentOwner);
    const view = equipmentView(game),
      piece = view.player.pieces.find((piece) => piece.uid === uid);
    if (piece) {
      closePanels();
      if (view.isFinal) {
        unitInfo = structuredClone(piece);
        unitInfoVersion = view.version;
        unitInfoFinal = true;
        render();
        return;
      }
      selected = uid;
      if (mobileViewport.matches) mobileView = "armory";
      render();
      document.querySelector("#armory")?.scrollIntoView({
        block: "nearest",
        behavior: preferences.reducedMotion ? "instant" : "smooth",
      });
      return;
    }
  }
  if (action === "settings") {
    closePanels();
    settingsOpen = true;
  }
  if (action === "debug") {
    openDebugShop();
    return;
  }
  if (action === "debug-submit") {
    e.preventDefault();
    submitDebugCommand();
    return;
  }
  if (debugOpen && (action === "debug-remove" || action === "debug-clear")) {
    if (!canEditDebugShop()) return;
    if (action === "debug-clear") delete game.debugShopQueue;
    else if (!removeShopCommand(game, Number(target.dataset.debugIndex))) return;
    debugNotice = { ok: true, message: action === "debug-clear" ? "已清空待刷新指令。" : "已移除该条指令。" };
    render();
    focusDebugCommand();
    return;
  }
  if (action === "unit-info") {
    const piece = p.pieces.find((piece) => piece.uid === selected);
    if (piece) {
      closePanels();
      unitInfo = structuredClone(piece);
    }
  }
  if (target.dataset.pieceInfo) {
    const piece = p.pieces.find(
      (piece) => piece.uid === Number(target.dataset.pieceInfo),
    );
    if (piece) {
      closePanels();
      unitInfo = structuredClone(piece);
    }
  }
  if (target.dataset.unitInfo && Object.hasOwn(UNIT, target.dataset.unitInfo)) {
    closePanels();
    unitInfo = {
      uid: 0,
      defId: target.dataset.unitInfo,
      definitionVersion:catalogDefinitionVersion(game,target.dataset.unitInfo),
      star: 1,
      position: null,
    };
  }
  if (action === "dismiss-notice") {
    saveNotice="";
    disclosures.set("save-notice",false);
    const details=app.querySelector<HTMLDetailsElement>('[data-disclosure="save-notice"]');
    if(details)details.open=false;
    syncSaveNotice();
    return;
  }
  if (target.dataset.scout !== undefined) {
    closePanels();
    scoutId = Number(target.dataset.scout);
    help = false;
    codex = false;
    historyOpen = false;
  }
  if (
    action === "auto-deploy" &&
    game.phase === "prepare" &&
    !demoBattle
  ) {
    runComputation({kind:"deploy",game},value=>{
      if(value.kind!=="deployment")return;
      if(applyRecommendedDeployment(game,value.positions)){
        selected=null;
        message(value.opponent
          ? `已参考${value.opponent.name}的当前阵容布阵，可继续手动调整。`
          : "已按现有棋子安排前后排，可继续手动调整。");
        saveCurrent();
      }else message("当前阵容已变化，请重新推荐布阵。");
    },"正在推荐布阵…");
    return;
  }
  if(action === "compact-deploy" && game.phase === "prepare" && !demoBattle){
    deployLineup(
      p,
      game.difficulty === "relaxed" ? "standard" : game.difficulty,
      "compact",
      game.combatVersion,
    );
    selected = null;
    message("已抱团保护后排；注意敌方范围技能，可继续手动调整。");
  }
  if (target.dataset.reward !== undefined) {
    if (claimReward(game, Number(target.dataset.reward))) {
      advanceRound();
      audio.play("reward");
      return;
    }
  }
  if (target.dataset.equip !== undefined && selected !== null && !demoBattle) {
    if (equip(game, p, Number(target.dataset.equip), selected)) {
      message("装备已穿戴，属性已生效。");
      audio.play("place");
    }
  }
  if (
    target.dataset.unequip !== undefined &&
    selected !== null &&
    !demoBattle
  ) {
    if (unequip(game, p, selected, Number(target.dataset.unequip)))
      message("装备已归还库存。");
  }
  if (target.dataset.craft !== undefined && !demoBattle) {
    if (craft(game, p, target.dataset.craft)) {
      message("合成完成，请将成装装备给主力棋子。");
      audio.play("merge");
    }
  }
  if (
    (target.dataset.watchRound !== undefined ||
      target.dataset.analyzeRound !== undefined) &&
    (game.phase === "prepare" || game.phase === "finished")
  ) {
    const report = game.history.find(
      (r) =>
        r.round ===
        Number(target.dataset.watchRound ?? target.dataset.analyzeRound),
    );
    if (report) {
      const analysisOnly = target.dataset.analyzeRound !== undefined;
      if (mobileViewport.matches) showMobileView("battlefield");
      historyOpen = false;
      runComputation(
        {
          kind: "replay",
          left: report.left,
          right: report.right,
          version: report.combatVersion,
        },
        (value) => {
          if (value.kind !== "replay") return;
          demoBattle = value.battle;
          replayRound = report.round;
          resultPresentation = null;
          playbackTime = analysisOnly ? value.battle.frames.length - 1 : 0;
          paused = analysisOnly;
          if (analysisOnly)
            openBattleAnalysis(
              value.battle,
              playbackTime,
              `第 ${report.round} 回合 · ${report.opponentName}`,
            );
          beginPlayback();
        },
        `正在准备第 ${report.round} 回合${analysisOnly ? "分析" : "回放"}…`,
      );
      return;
    }
  }
  if (target.dataset.buy !== undefined) {
    const beforeCount = p.pieces.length;
    if (!buy(game, p, Number(target.dataset.buy)))
      message("购买失败：检查金币或备战席空间。");
    else {
      message("招募完成。点击备战棋子，再选择部署位置。");
      audio.play(p.pieces.length <= beforeCount ? "merge" : "buy");
    }
  }
  if (target.dataset.bench !== undefined) {
    selected = target.dataset.bench ? Number(target.dataset.bench) : null;
  }
  if (target.dataset.cell !== undefined) {
    selectCell(Number(target.dataset.cell));
    return;
  }
  if (
    action === "demo" ||
    action === "summon-demo" ||
    action === "insect-demo" ||
    action === "airsea-demo" ||
    action === "immortal-demo" ||
    action === "wild-demo" ||
    action === "rider-demo" ||
    action === "armor-demo" ||
    action === "axe-demo" ||
    action === "sword-demo" ||
    action === "blade-demo" ||
    action === "shield-demo" ||
    action === "staff-demo" ||
    action === "beast-demo" ||
    action === "lingjiu-demo" ||
    action === "wildfront-demo" ||
    action === "assassin-demo" ||
    action === "counterplay-demo" ||
    action === "abnormal-demo" ||
    action === "coalition-demo" ||
    action === "aurora-demo" ||
    action === "taotie-demo" ||
    action === "tar-demo" ||
    action === "lightning-demo" ||
    action === "gospel-demo" ||
    action === "thunderstorm-demo" ||
    action === "jungle-demo" ||
    action === "wushi-demo" ||
    action === "shuriken-demo" ||
    action === "secret-orb-demo" ||
    action === "secret-orb-counter-demo" ||
    action === "bombardment-demo" ||
    action === "terminator-demo" ||
    action === "warcry-demo" ||
    action === "tornado-demo" ||
    action === "wildfire-demo" ||
    action === "boneblast-demo" ||
    action === "thornbind-demo" ||
    action === "siege-demo" ||
    action === "inferno-demo" ||
    action === "mending-demo" ||
    action === "formless-demo" ||
    action === "equipment-skills-demo" || action === "whale-eye-demo" || action === "detonation-demo" ||
    action === "dream-demo" ||
    action === "support-actions-demo" ||
    action === "execution-demo" ||
    action === "tortoise-shell-demo" || action === "tortoise-breach-demo" ||
    action === "spirit-ward-demo" ||
    action === "bulwark-demo" ||
    action === "hive-demo" ||
    action === "gaze-demo" ||
    action === "rifle-demo"
  ) {
    demoTitle=action==="detonation-demo"?"囊爆连锁":action==="whale-eye-demo"?"海雾回能":action==="equipment-skills-demo"?"装备主动技能":action==="dream-demo"?"迷梦蛛丝":action==="support-actions-demo"?"隐形支援":action==="formless-demo"?"无形幽灵机":action==="mending-demo"?"灵蕴缝合":action==="inferno-demo"?"炎狱金刚":action==="siege-demo"?"攻城炮台":action==="execution-demo"?"刑杀勾魂":action==="tortoise-shell-demo"?"玄龟守御":action==="tortoise-breach-demo"?"玄龟破壳":"兵种演习";
    if (mobileViewport.matches) showMobileView("battlefield");
    resultPresentation = null;
    replayRound = null;
    if (demoBattle) {
      stopTimer();
      demoBattle = null;
      paused = false;
      playbackTime = result ? result.battle.frames.length - 1 : 0;
    } else {
      summonDemo = action === "summon-demo";
      insectDemo = action === "insect-demo";
      airseaDemo = action === "airsea-demo";
      immortalDemo = action === "immortal-demo";
      wildDemo = action === "wild-demo";
      riderDemo = action === "rider-demo";
      armorDemo = action === "armor-demo";
      axeDemo = action === "axe-demo";
      bladeDemo = action === "blade-demo";
      shieldDemo = action === "shield-demo";
      lingjiuDemo = action === "lingjiu-demo";
      wildfrontDemo = action === "wildfront-demo";
      assassinDemo = action === "assassin-demo";
      counterplayDemo = action === "counterplay-demo";
      abnormalDemo = action === "abnormal-demo";
      coalitionDemo = action === "coalition-demo";
      auroraDemo = action === "aurora-demo";
      taotieDemo = action === "taotie-demo";
      tarDemo = action === "tar-demo";
      lightningDemo = action === "lightning-demo";
      gospelDemo = action === "gospel-demo";
      thunderstormDemo = action === "thunderstorm-demo";
      jungleDemo = action === "jungle-demo";
      wushiDemo = action === "wushi-demo";
      shurikenDemo = action === "shuriken-demo";
      secretOrbDemo = action === "secret-orb-demo";
      secretOrbCounterDemo = action === "secret-orb-counter-demo";
      bombardmentDemo = action === "bombardment-demo";
      terminatorDemo = action === "terminator-demo";
      warcryDemo = action === "warcry-demo";
      tornadoDemo = action === "tornado-demo";
      wildfireDemo = action === "wildfire-demo";
      boneblastDemo = action === "boneblast-demo";
      thornbindDemo = action === "thornbind-demo";
      spiritWardDemo = action === "spirit-ward-demo";
      bulwarkDemo = action === "bulwark-demo";
      hiveDemo = action === "hive-demo";
      gazeDemo = action === "gaze-demo";
      rifleDemo = action === "rifle-demo";
      beastDemo = action === "beast-demo";
      staffDemo = action === "staff-demo";
      swordDemo = action === "sword-demo";
      const { left, right } = action === "detonation-demo" ? DETONATION_DEMO : action === "whale-eye-demo" ? WHALE_EYE_DEMO : action === "equipment-skills-demo" ? EQUIPMENT_SKILLS_DEMO : action === "dream-demo" ? DREAM_DEMO : action === "support-actions-demo" ? SUPPORT_ACTIONS_DEMO : action === "formless-demo" ? FORMLESS_DEMO : action === "mending-demo" ? MENDING_DEMO : action === "inferno-demo" ? INFERNO_DEMO : action === "siege-demo" ? SIEGE_DEMO : action === "execution-demo" ? EXECUTION_DEMO : action === "tortoise-shell-demo" ? TORTOISE_SHELL_DEMO : action === "tortoise-breach-demo" ? TORTOISE_BREACH_DEMO : spiritWardDemo ? SPIRIT_WARD_DEMO : bulwarkDemo ? BULWARK_DEMO : hiveDemo ? HIVE_DEMO : gazeDemo ? GAZE_DEMO : rifleDemo ? RIFLE_DEMO : thornbindDemo ? THORNBIND_DEMO : boneblastDemo ? BONEBLAST_DEMO : wildfireDemo ? WILDFIRE_DEMO : tornadoDemo ? TORNADO_DEMO : warcryDemo ? WARCRY_DEMO : terminatorDemo ? TERMINATOR_DEMO : bombardmentDemo ? BOMBARDMENT_DEMO : secretOrbCounterDemo ? SECRET_ORB_COUNTER_DEMO : secretOrbDemo ? SECRET_ORB_DEMO : shurikenDemo ? SHURIKEN_DEMO : wushiDemo ? WUSHI_DEMO : jungleDemo ? JUNGLE_DEMO : thunderstormDemo ? THUNDERSTORM_DEMO : gospelDemo
        ? GOSPEL_DEMO
        : lightningDemo
          ? LIGHTNING_DEMO
        : tarDemo
          ? TAR_DEMO
          : taotieDemo
            ? TAOTIE_DEMO
            : auroraDemo
              ? AURORA_DEMO
              : coalitionDemo
                ? COALITION_DEMO
                : abnormalDemo
                  ? ABNORMAL_DEMO
                  : counterplayDemo
                    ? COUNTERPLAY_DEMO
                    : assassinDemo
                      ? ASSASSIN_DEMO
                      : wildfrontDemo
                        ? WILDFRONT_DEMO
                        : lingjiuDemo
                          ? LINGJIU_DEMO
                          : beastDemo
                            ? BEAST_FRONTLINE_DEMO
                            : staffDemo
                              ? STAFFTHRALL_DEMO
                              : shieldDemo
                                ? SHIELDTHRALL_DEMO
                                : bladeDemo
                                  ? BLADETHRALL_DEMO
                                  : swordDemo
                                    ? SWORDTHRALL_DEMO
                                    : axeDemo
                                      ? AXETHRALL_DEMO
                                      : demoArmies(
                                          summonDemo,
                                          insectDemo,
                                          airseaDemo,
                                          immortalDemo,
                                          wildDemo,
                                          riderDemo,
                                          armorDemo,
                                        );
      runComputation(
        { kind: "replay", left, right, version: CURRENT_COMBAT_VERSION },
        (value) => {
          if (value.kind !== "replay") return;
          demoBattle = value.battle;
          paused = false;
          playbackTime = 0;
          beginPlayback();
        },
        "正在准备兵种演习…",
      );
      return;
    }
  }
  if (action === "pause") {
    paused = !paused;
    if (paused) audio.stop();
  }
  if (action === "deselect") {
    const piece = p.pieces.find((piece) => piece.uid === selected);
    selected = null;
    render();
    const focusTarget =
      piece?.position === null
        ? `[data-bench="${piece.uid}"]`
        : piece && deploymentOpen
          ? `[data-cell="${piece.position}"]`
          : '[data-action="deployment"]';
    app.querySelector<HTMLElement>(focusTarget)?.focus({ preventScroll: true });
    return;
  }
  if (action === "refresh") {
    roll(game, p);
    selected = null;
  }
  if (action === "lock") p.locked = !p.locked;
  if (action === "xp") buyXp(game, p);
  if (action === "sell" && selected !== null) {
    sell(game, p, selected);
    selected = null;
  }
  if (action === "recall" && selected !== null) {
    if (!move(game, p, selected, null)) message("备战席已满。");
    selected = null;
  }
  if (action === "speed") speed = speed === 2 ? 4 : speed === 4 ? 1 : 2;
  if (action === "help") {
    closePanels();
    help = true;
    codex = false;
    historyOpen = false;
  }
  if (action === "codex") {
    closePanels();
    codex = true;
    help = false;
    historyOpen = false;
  }
  if (action === "history") {
    closePanels();
    historyOpen = true;
    help = false;
    codex = false;
  }
  if (action === "close") closePanels();
  if (action === "restart") {
    closePanels();
    restartOpen = true;
    syncVisibility();
    render();
    return;
  }
  if (action === "confirm-restart" && restartOpen) {
    reset();
    saveCurrent();
    return;
  }
  if (action === "next") {
    if (mobileViewport.matches) showMobileView("battlefield");
    if (game.phase === "finished") {
      reset();
      return;
    }
    if (game.phase === "result") {
      advanceRound();
      return;
    } else if (game.phase === "prepare" || game.phase === "battle") {
      calculateRound(game.phase === "prepare" ? "start" : "resume");
      return;
    }
  }
  render();
});
app.addEventListener("change", (e) => {
  const input = e.target;
  if (
    analysisView &&
    input instanceof HTMLSelectElement &&
    input.hasAttribute("data-analysis-metric") &&
    Object.hasOwn(BATTLE_METRICS, input.value)
  ) {
    analysisMetric = input.value as BattleMetric;
    render();
    return;
  }
  if (
    analysisView &&
    input instanceof HTMLInputElement &&
    input.hasAttribute("data-analysis-frame")
  ) {
    analysisView.at = Math.max(
      0,
      Math.min(analysisView.limit, Math.floor(Number(input.value) || 0)),
    );
    render();
    return;
  }
  if (
    (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) &&
    input.dataset.setting
  ) {
    const key = input.dataset.setting;
    if (key === "soundVolume" && input instanceof HTMLInputElement) {
      preferences.soundVolume = Math.max(0, Math.min(100, Number(input.value)));
      const output = app.querySelector("#sound-volume");
      if (output) output.textContent = String(preferences.soundVolume);
    } else if (key === "quality" && Object.hasOwn(QUALITY, input.value))
      preferences.quality = input.value as typeof preferences.quality;
    else if (
      input instanceof HTMLInputElement &&
      (key === "soundEnabled" ||
        key === "damageNumbers" ||
        key === "reducedMotion" ||
        key === "pauseHidden")
    )
      preferences[key] = input.checked;
    document.documentElement.dataset.reducedMotion = String(
      preferences.reducedMotion,
    );
    audio.configure(preferences);
    void audio.unlock().then(updateSoundStatus);
    syncVisibility();
    const status = app.querySelector(".preferences-status");
    if (status)
      status.textContent = savePreferences(storage, preferences)
        ? "设置已保存"
        : "已应用；浏览器存储不可用，本次关闭后将恢复默认设置。";
    return;
  }
  if (!(input instanceof HTMLSelectElement)) return;
  if (input.hasAttribute("data-difficulty")) {
    if (
      !computing &&
      game.round === 1 &&
      game.phase === "prepare" &&
      !saveConflict &&
      Object.hasOwn(DIFFICULTIES, input.value)
    ) {
      game.difficulty = input.value as Game["difficulty"];
      render();
    }
    return;
  }
  if (!input.dataset.codex) return;
  const key = input.dataset.codex;
  if (key === "availability") codexFilters.availability = input.value;
  if (key === "cost") codexFilters.cost = input.value;
  if (key === "trait") codexFilters.trait = input.value;
  if (key === "star") codexFilters.star = Number(input.value);
  if (key === "sort") codexFilters.sort = input.value;
  if (key === "range") codexFilters.range = input.value;
  refreshCodex(app, game);
});
app.addEventListener("submit", (event) => {
  if (!(event.target instanceof HTMLFormElement) || !event.target.hasAttribute("data-debug-command-form")) return;
  event.preventDefault();
  submitDebugCommand();
});
app.addEventListener("input", (event) => {
  const input = event.target;
  if (input instanceof HTMLInputElement && input.dataset.focus === "debug-command") {
    debugCommand = input.value;
    return;
  }
  if (input instanceof HTMLInputElement && input.dataset.focus === "debug-quantity") {
    debugQuantity = input.value;
    return;
  }
  if (!(input instanceof HTMLInputElement) || input.dataset.codex !== "query")
    return;
  codexFilters.query = input.value;
  refreshCodex(app, game);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target instanceof HTMLInputElement &&
    (e.target.dataset.focus === "debug-command" || e.target.dataset.focus === "debug-quantity")) {
    e.preventDefault();
    if (!e.isComposing && e.keyCode !== 229) submitDebugCommand();
    return;
  }
  if (e.key === "/" && !e.defaultPrevented && !e.isComposing && !e.ctrlKey && !e.metaKey && !e.altKey &&
    !(e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.closest("input, textarea, select"))) &&
    !app.querySelector('[role="dialog"]')) {
    e.preventDefault();
    openDebugShop("/");
    return;
  }
  const cell =
    e.target instanceof HTMLElement
      ? e.target.closest<HTMLElement>("[data-cell]")
      : null;
  if (
    cell &&
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(
      e.key,
    )
  ) {
    const position = Number(cell.dataset.cell);
    const offset =
      { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 }[
        e.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"
      ] ?? 0;
    const target =
      e.key === "Home"
        ? position - (position % 8)
        : e.key === "End"
          ? position - (position % 8) + 7
          : position + offset;
    e.preventDefault();
    if (target >= 32 && target < 64)
      app.querySelector<HTMLElement>(`[data-cell="${target}"]`)?.focus();
    return;
  }
  if (e.key === "Escape") {
    const popup = app.querySelector<HTMLDetailsElement>(
      ".game-toolbar > details[open]",
    );
    if (popup && !app.querySelector('[role="dialog"]')) {
      popup.open = false;
      popup.querySelector<HTMLElement>("summary")?.focus();
      return;
    }
    const hadModal = !!app.querySelector('[role="dialog"]');
    if (!hadModal && scene?.dismissInspection()) {
      e.preventDefault();
      return;
    }
    closePanels();
    if (!hadModal) selected = null;
    render();
  }
});
function selectCell(pos: number) {
  if (
    computing ||
    game.phase !== "prepare" ||
    demoBattle ||
    saveConflict ||
    pos < 32
  )
    return;
  const p = me(),
    at = p.pieces.find((x) => x.position === pos);
  if (selected !== null) {
    if (!move(game, p, selected, pos))
      message("部署失败：人口已满，或该位置不可用。");
    else {
      selected = null;
      audio.play("place");
    }
  } else if (at) selected = at.uid;
  render();
}
function demoArmies(
  summoners = false,
  insects = false,
  airsea = false,
  immortal = false,
  wild = false,
  riders = false,
  armor = false,
) {
  if (armor)
    return {
      left: [
        { uid: 101, defId: "ironape", star: 2, position: 35 },
        { uid: 102, defId: "irondog", star: 2, position: 36 },
        { uid: 103, defId: "ghostjet", star: 2, position: 58 },
        { uid: 104, defId: "motorcycle", star: 2, position: 51 },
        { uid: 105, defId: "titan", star: 1, position: 34 },
        { uid: 106, defId: "bomber", star: 2, position: 37 },
        { uid: 107, defId: "ironrooster", star: 2, position: 43 },
        { uid: 108, defId: "phoenix", star: 2, position: 59 },
      ] satisfies Piece[],
      right: [
        { uid: 201, defId: "turtle", star: 2, position: 35 },
        { uid: 202, defId: "vajra", star: 2, position: 36 },
        { uid: 203, defId: "arhat", star: 2, position: 37 },
        { uid: 204, defId: "infantry", star: 2, position: 51 },
        { uid: 205, defId: "medic", star: 2, position: 43 },
        { uid: 206, defId: "birdrider", star: 2, position: 58 },
        { uid: 207, defId: "adept", star: 2, position: 50 },
        { uid: 208, defId: "shark", star: 2, position: 34 },
      ] satisfies Piece[],
    };
  if (riders)
    return {
      left: [
        { uid: 101, defId: "birdrider", star: 3, position: 56 },
        { uid: 102, defId: "motorcycle", star: 2, position: 43 },
        { uid: 103, defId: "cavalry", star: 2, position: 34 },
        { uid: 104, defId: "dragonfly", star: 2, position: 58 },
        { uid: 105, defId: "guard", star: 3, position: 35 },
        { uid: 106, defId: "medic", star: 2, position: 50 },
      ] satisfies Piece[],
      right: [
        { uid: 201, defId: "irondog", star: 3, position: 35 },
        { uid: 202, defId: "turtle", star: 2, position: 36 },
        { uid: 203, defId: "guard", star: 3, position: 37 },
        { uid: 204, defId: "infantry", star: 2, position: 51 },
        { uid: 205, defId: "medic", star: 2, position: 43 },
        { uid: 206, defId: "arhat", star: 2, position: 58 },
      ] satisfies Piece[],
    };
  const left: Piece[] = [
    { uid: 101, defId: "guard", star: 2, position: 35 },
    { uid: 102, defId: "flametrooper", star: 2, position: 34 },
    { uid: 103, defId: "irondog", star: 2, position: 37 },
    { uid: 104, defId: "infantry", star: 2, position: 51 },
    { uid: 105, defId: "medic", star: 2, position: 43 },
    { uid: 106, defId: "motorcycle", star: 2, position: 52 },
    { uid: 107, defId: "cavalry", star: 2, position: 33 },
    { uid: 108, defId: "grenadier", star: 2, position: 44 },
    { uid: 109, defId: "sniper", star: 2, position: 58 },
    { uid: 110, defId: "deer", star: 2, position: 57 },
  ];
  const right: Piece[] = [
    { uid: 201, defId: "titan", star: 1, position: 35 },
    { uid: 202, defId: "lion", star: 2, position: 36 },
    { uid: 203, defId: "wolf", star: 2, position: 33 },
    { uid: 204, defId: "sniper", star: 2, position: 58 },
    { uid: 205, defId: "master", star: 1, position: 45 },
    { uid: 206, defId: "chariot", star: 2, position: 61 },
    { uid: 207, defId: "shadowblade", star: 1, position: 34 },
    { uid: 208, defId: "turtle", star: 1, position: 37 },
    { uid: 209, defId: "tiger", star: 1, position: 60 },
    { uid: 210, defId: "bull", star: 2, position: 43 },
  ];
  if (summoners) {
    left[0] = {
      uid: 101,
      defId: "shark",
      star: 2,
      position: 34,
      items: ["staff"],
    };
    left[1] = { uid: 102, defId: "wolf", star: 2, position: 36 };
    left[9] = {
      uid: 110,
      defId: "adept",
      star: 2,
      position: 49,
      items: ["staff"],
    };
  }
  if (insects) {
    left[0] = { uid: 101, defId: "blastbug", star: 2, position: 35 };
    left[3] = { uid: 104, defId: "eyebug", star: 2, position: 43 };
    left[7] = {
      uid: 108,
      defId: "spider",
      star: 2,
      position: 42,
      items: ["staff"],
    };
    left[9] = { uid: 110, defId: "wasp", star: 2, position: 44 };
    left[4].position = 52;
  }
  if (airsea) {
    const ids = [
      "shark",
      "bomber",
      "ghostjet",
      "skycrab",
      "eel",
      "ark",
      "repair",
      "fish",
      "guard",
      "whale",
    ];
    const positions = [35, 36, 33, 43, 44, 60, 51, 50, 34, 52];
    left.splice(
      0,
      left.length,
      ...ids.map((defId, i) => ({
        uid: 101 + i,
        defId,
        star: 2,
        position: positions[i],
        ...(["bomber", "ark", "eel", "repair", "whale"].includes(defId)
          ? { items: ["staff"] }
          : {}),
      })),
    );
  }
  if (wild) {
    const ids = [
      "shieldthrall",
      "bloodhawk",
      "phoenix",
      "lion",
      "bat",
      "skytoad",
      "arhat",
      "ark",
      "bonedragon",
      "repair",
    ];
    const positions = [35, 36, 52, 37, 43, 44, 59, 34, 51, 60];
    left.splice(
      0,
      left.length,
      ...ids.map((defId, i) => ({
        uid: 101 + i,
        defId,
        star: 2,
        position: positions[i],
        ...(defId === "arhat" || defId === "bat" ? { items: ["staff"] } : {}),
      })),
    );
  }
  if (immortal) {
    const ids = [
      "vine",
      "treant",
      "guard",
      "bonedragon",
      "adept",
      "stormcaller",
      "acolyte",
      "thunderlord",
    ];
    const positions = [35, 36, 34, 44, 51, 52, 43, 53];
    left.splice(
      0,
      left.length,
      ...ids.map((defId, i) => ({
        uid: 101 + i,
        defId,
        star: 2,
        position: positions[i],
      })),
    );
  }
  if (!summoners && !insects && !airsea && !immortal && !wild) {
    // Keep the channeling frontliner away from the opening titan knockdown
    // so the general unit showcase can display all three shock pulses.
    left[0].position = 37;
    left[2].position = 35;
    left[8] = {
      uid: 109,
      defId: "specialist",
      star: 2,
      position: 58,
      items: ["staff"],
    };
  }
  return { left, right };
}
function beginPlayback() {
  stopTimer();
  const activeBattle = demoBattle ?? result?.battle;
  if (activeBattle) soundTrack.reset(activeBattle, playbackTime);
  if (playbackTime === 0 && !paused) audio.play("start");
  let last = performance.now(),
    lastFrame = -1;
  timer = setInterval(() => {
    const now = performance.now(),
      elapsed = Math.min(100, now - last);
    last = now;
    if (document.hidden && preferences.pauseHidden) return;
    if (paused || restartOpen) return;
    if (demoBattle && resultPresentation?.demo) {
      if (now - resultPresentation.startedAt >= RESULT_DURATION_MS) {
        resultPresentation = null;
        playbackTime = 0;
        frame = 0;
        lastFrame = -1;
        soundTrack.reset(demoBattle, 0);
        audio.play("start");
        render();
      }
      return;
    }
    if (Date.now() - lastSaveAt >= 1000) {
      saveCurrent();
      if (saveConflict) {
        render();
        return;
      }
    }
    const battle = demoBattle ?? result?.battle;
    if (!battle) return;
    playbackTime += (elapsed / 250) * speed;
    for (const cue of soundTrack.take(
      battle,
      playbackTime,
      !document.hidden &&
        preferences.soundEnabled &&
        preferences.soundVolume > 0,
    ))
      audio.play(cue.kind, cue.pan, true);
    const end = battle.frames.length - 1;
    // Allow the final arcing shell and its impact to finish before settlement.
    if (playbackTime > end + 5) {
      if (demoBattle) {
        playbackTime = end;
        audio.stop();
        audio.play(
          demoBattle.winner === 0
            ? "win"
            : demoBattle.winner === 1
              ? "loss"
              : "draw",
        );
        resultPresentation = {
          winner: demoBattle.winner,
          startedAt: performance.now(),
          round: replayRound ?? game.round,
          damage: 0,
          income: 0,
          terminal: false,
          rank: 0,
          demo: true,
          replay: replayRound !== null,
        };
        render();
        return;
      } else {
        playbackTime = end;
        finish();
        return;
      }
    }
    frame = Math.min(Math.floor(playbackTime), end);
    if (lastFrame !== frame) {
      lastFrame = frame;
      const clock = document.querySelector(".battle-clock");
      if (clock)
        clock.textContent = demoBattle
          ? `${(frame * RULES.tickSeconds).toFixed(1)}s`
          : `${(frame * 0.25).toFixed(1)}s`;
      const stats = document.querySelector(".damage-stats");
      if (stats)
        stats.innerHTML = battle.frames[frame].fighters
          .filter((f) => (f.homeSide ?? f.side) === 0)
          .sort((a, b) => b.damage - a.damage)
          .slice(0, 6)
          .map(
            (f) =>
              `<div class="damage"><img src="${spriteUrl(fighterSprite(f))}" alt=""><span>${fighterName(f)}<small>${f.spiritWard ? `防护减伤 ${f.spiritWard.mitigated}` : `治疗 ${f.healing} · 承盾 ${f.absorbed}`}</small></span><b>${f.damage}</b></div>`,
          )
          .join("");
    }
  }, 16);
}

// Restore phase first; never run AI preparation or settle an already-settled save.
syncVisibility();
render();
if (game.phase === "battle" && !saveConflict) calculateRound("resume");
else if (game.phase === "result" || game.phase === "finished") {
  const last = game.history.at(-1)!;
  runComputation(
    {
      kind: "replay",
      left: last.left,
      right: last.right,
      version: last.combatVersion,
    },
    (value) => {
      if (value.kind !== "replay") return;
      result = {
        round: last.round,
        combatVersion: last.combatVersion,
        seed: game.seed,
        left: last.left,
        right: last.right,
        opponent: {
          id: last.opponentId,
          name: last.opponentName,
          pieces: last.right,
        },
        kind: last.kind,
        battle: value.battle,
        outcomes: [],
      };
      playbackTime = value.battle.frames.length - 1;
      resultPresentation = {
        winner: last.winner,
        startedAt: performance.now(),
        round: last.round,
        damage: last.damage,
        income: last.income,
        terminal: game.phase === "finished",
        rewardPending: !!game.reward,
        rank: rankings(game).findIndex((p) => p.id === 0) + 1,
      };
      if (game.phase === "result")
        advanceTimer.schedule(advanceRound, RESULT_DURATION_MS);
    },
    "正在恢复战报…",
  );
}
window.addEventListener("pagehide", () => {
  cancelComputation();
  audio.stop();
  saveCurrent();
});
function syncVisibility() {
  audio.setHidden(document.hidden || restartOpen);
  const suspended = restartOpen || (document.hidden && preferences.pauseHidden);
  document.documentElement.dataset.pageSuspended = String(suspended);
  advanceTimer.setPaused(suspended);
  if (suspended && hiddenAt === null) hiddenAt = performance.now();
  if (!suspended && hiddenAt !== null) {
    if (resultPresentation)
      resultPresentation.startedAt += performance.now() - hiddenAt;
    hiddenAt = null;
  }
}
document.addEventListener("visibilitychange", () => {
  syncVisibility();
  if (document.hidden) saveCurrent();
});
window.addEventListener("storage", (e) => {
  if (e.key === SAVE_KEY) {
    saveCurrent();
    if (saveConflict) render();
  }
});
