import { BattleComputer, ComputationCancelled } from "./compute/client";
import type { ComputeJob, ComputeResult } from "./compute/job";
import { GameAudio } from "./audio/player";
import { BattleSoundTrack } from "./audio/cues";
import {
  loadPreferences,
  savePreferences,
  settingsMarkup,
  QUALITY,
} from "./ui/preferences";
import { deploymentMarkup } from "./ui/deployment";
import { DialogFocus } from "./ui/dialog-focus";
import { PausableDelay } from "./ui/pausable-delay";
import { AI_PROFILES, DIFFICULTIES } from "./data/ai-profiles";
import { deployLineup } from "./engine/ai";
import { scoutingMarkup } from "./ui/scouting";
import { equipmentMarkup, rewardMarkup, encounterMarkup } from "./ui/equipment";
import { equip, unequip, craft, claimReward } from "./engine/equipment";
import { SaveStore, SAVE_KEY, type PlaybackSave } from "./engine/persistence";
import { historyMarkup } from "./ui/match-history";
import { matchSummaryMarkup } from "./ui/match-summary";
import { codexMarkup, codexCards, codexFilters } from "./ui/unit-codex";
import "./style.css";
import {
  resultMarkup,
  RESULT_DURATION_MS,
  type ResultPresentation,
} from "./ui/battle-result";
import { BenchTooltip, pieceInfoMarkup } from "./ui/bench-tooltip";
import "./visual.css";
import { BattleScene, spriteUrl } from "./render/scene";
import type { Battle, Game } from "./engine/types";
import { UNIT, UNITS, RULES, XP, ODDS } from "./data/units";
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
let settingsOpen = false;
let unitInfo: Piece | null = null;
let deploymentOpen = false;
let hiddenAt: number | null = null;
const saves = new SaveStore(storage);
const restored = saves.load();
let saveNotice = restored.data
  ? `${restored.status === "recovered" ? "主存档异常，已从备份恢复" : restored.status === "migrated" ? "存档已升级并恢复" : "已恢复上次演习"} · 第 ${restored.data.game.round} 回合`
  : restored.status === "damaged"
    ? "原存档损坏，已新建对局；损坏数据已保留用于恢复。"
    : "";
let saveConflict = false;
let lastSaveAt = 0;
let historyOpen = false;
let scoutId: number | null = null;
let replayRound: number | null = null;
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
let paused = restored.data?.playback.paused ?? false;
let resultPresentation: ResultPresentation | null = null;
const advanceTimer = new PausableDelay();
const benchTooltip = new BenchTooltip(
  app,
  (uid) => me().pieces.find((p) => p.uid === uid && p.position === null),
  () => game.combatVersion,
);
const me = () => game.players[0];
const disabled = (condition: boolean) => (condition ? "disabled" : "");
const stars = (n: number) => "★".repeat(n);
function token(p: Piece | Fighter, enemy = false) {
  const u = UNIT[p.defId];
  const fighter = "hp" in p ? p : null;
  return `<span class="piece ${enemy ? "enemy" : ""} ${fighter?.flash ? "flash" : ""}" style="--unit:${u.color}"><img class="unit-portrait" src="${spriteUrl(p.defId)}" alt="${u.name}" draggable="false"><span class="piece-name">${u.name}</span><span class="stars">${stars(p.star)}</span>${fighter ? `<span class="health"><i style="width:${Math.max(0, (fighter.hp / fighter.maxHp) * 100)}%"></i></span>` : ""}</span>`;
}
function render() {
  dialogs.beforeRender();
  document.documentElement.dataset.reducedMotion = String(
    preferences.reducedMotion,
  );
  saveCurrent();
  benchTooltip.hide();
  scene?.destroy();
  const p = me(),
    busy = game.phase !== "prepare" || saveConflict || computing,
    fighting = game.phase === "battle" && result !== null,
    done = game.phase === "finished";
  const lastWinner = result
    ? result.battle.winner
    : game.history.at(-1)?.winner;
  const chosen = p.pieces.find((x) => x.uid === selected),
    onboard = p.pieces.filter((x) => x.position !== null),
    bench = p.pieces.filter((x) => x.position === null);
  const shownBattle = demoBattle ?? (fighting ? result?.battle : null);
  const fighters = shownBattle
    ? shownBattle.frames[
        Math.min(Math.floor(playbackTime), shownBattle.frames.length - 1)
      ].fighters
    : [];
  const active = synergies(p.pieces, game.combatVersion);
  const ranked = rankings(game);
  app.innerHTML = `<div class="shell"><header><a class="brand" href="/" aria-label="赤潮战术演习主页"><span class="brand-mark">赤</span><span>赤潮 <b>RED TIDES</b><small>战 争 艺 术 / AUTO CHESS</small></span></a><div class="mode"><i></i>单人演习 <span>${DIFFICULTIES[game.difficulty].name} · 你 + 7 位 AI</span></div><nav><button data-action="demo" ${disabled(computing || fighting || game.phase === "result")}>${demoBattle ? "退出演示" : "观看战斗演示"}</button><button data-action="codex">棋子图鉴</button><button data-action="history">本局战报</button><button data-action="help">作战指南</button><button data-action="settings">设置</button><button data-action="restart">重新开始</button></nav></header>${saveNotice || saveConflict ? `<div class="save-notice" role="status">${saveConflict ? "另一窗口已更新存档。本窗口已暂停，请载入最新进度后继续。" : saveNotice}<button data-action="load">载入最新存档</button>${saveConflict ? "" : '<button data-action="dismiss-notice" aria-label="关闭存档提示">×</button>'}</div>` : ""}
 ${computing || computeError ? `<section class="compute-status" role="status" aria-live="polite"><span>${computing ? pendingJob?.label : computeError}</span><div>${!computing ? '<button data-action="retry-compute">重试计算</button>' : ""}<button data-action="cancel-compute">${computing ? "取消计算" : "关闭"}</button></div></section>` : ""}
 <div class="command"><div><span class="eyebrow">RED TIDES / 云海遗迹</span><h1>${demoBattle ? (replayRound ? `第 ${replayRound} 回合 · 战斗回放` : "十对十 · 兵种演习") : done ? "演习结束" : fighting ? "交战进行中" : game.phase === "result" ? "战斗结算" : "部署你的下一步"}</h1></div><div class="round"><small>回合</small><strong>${String(game.round).padStart(2, "0")}</strong><span>/ ${RULES.maxRounds}</span></div><div class="phase"><span class="phase-dot"></span>${demoBattle ? "战斗演示" : { prepare: "准备阶段", battle: "自动战斗", result: game.reward ? "回合结算 · 选择战利品" : "回合结算 · 即将进入准备", finished: "最终战报" }[game.phase]}<small class="battle-clock">${demoBattle ? "演示 · 十对十" : fighting ? `战斗时间 ${(frame * RULES.tickSeconds).toFixed(1)}s` : "从组合中找到胜机"}</small></div><button class="primary start" data-action="next" ${disabled(computing || saveConflict || !!game.reward || fighting || (!onboard.length && !done && game.phase === "prepare"))}>${computing ? "正在计算…" : game.phase === "battle" && !result ? "恢复战斗" : done ? "开始新演习" : game.phase === "result" ? (game.reward ? "选择战利品" : "下一回合 →") : "开始战斗 →"}</button></div>
 ${!demoBattle ? matchSummaryMarkup(game) : ""}
 ${!demoBattle && !done ? encounterMarkup(game) : ""}
 <main><aside class="left"><section class="panel commander" id="commander"><span class="eyebrow">COMMANDER</span><label class="difficulty-setting">难度<select data-difficulty aria-label="单机难度" title="仅在第 1 回合开战前选择难度" ${disabled(game.round !== 1 || busy || !!demoBattle)}>${Object.entries(
   DIFFICULTIES,
 )
   .map(
     ([key, d]) =>
       `<option value="${key}" ${game.difficulty === key ? "selected" : ""}>${d.name}</option>`,
   )
   .join(
     "",
   )}</select></label><p class="difficulty-hint">${DIFFICULTIES[game.difficulty].description}</p><h2>指挥官 <span>01</span></h2><div class="vitals"><strong>${p.hp}<small>生命值</small></strong><strong class="gold">${p.gold}<small>金币</small></strong></div><div class="life"><i style="width:${p.hp}%"></i></div><div class="level"><span>等级 <b>${p.level}</b></span><span>${p.level === 10 ? "MAX" : `${p.xp} / ${XP[p.level]} XP`}</span></div><div class="xp"><i style="width:${p.level === 10 ? 100 : (p.xp / XP[p.level]) * 100}%"></i></div><button class="wide" data-action="xp" ${disabled(busy || p.gold < 5 || p.level === 10)}>购买经验 <span>5 金 / 5 XP</span></button><p class="micro">预计利息 +${Math.min(5, Math.floor(p.gold / 10))} 金 · ${p.streak >= 0 ? "连胜" : "连败"} ${Math.abs(p.streak)}</p></section>
 <section class="panel synergies"><div class="section-label"><h2>阵容连携</h2><span>${active.filter((s) => s.active).length} 已激活</span></div>${active.length ? active.map((s) => `<div class="synergy ${s.active ? "active" : ""}"><span class="trait-icon">${s.active ? "◆" : "◇"}</span><div><b>${s.trait}</b><small>${s.description}</small></div><em title="梯度 ${s.tiers.join(" / ")}">${s.count}/${s.threshold}<small>${s.tier ? `${s.tier} 档` : "未激活"}</small></em></div>`).join("") : '<p class="empty">部署不同棋子，<br>组合兵种与职业连携。</p>'}<p class="micro">同名棋子仅计数一次</p></section>
 </aside>
 <section class="arena" id="battlefield"><div class="arena-label"><span><i class="red-dot"></i>${fighting ? result!.opponent.name : "敌方阵地"}</span><span>${fighting ? "实时战况" : "8 × 8 战术棋盘"} <button class="speed" data-action="speed">${speed}×</button></span></div><div class="battle-stage ${demoBattle ? "is-demo" : ""}"><canvas id="battle-canvas" role="img" aria-label="斜俯视战场：点击己方棋格部署选中的棋子"></canvas><div class="stage-title"><span>云海遗迹</span><small>THE CLOUD SANCTUARY</small></div><div class="stage-status">${demoBattle ? "回放演示 · 不影响当前对局" : fighting ? "交战中" : game.phase === "result" ? "战果展示 · 即将进入准备" : done ? "演习结束" : "部署阶段 · 己方半场可落子"}</div><div class="stage-controls"><button data-action="pause" ${disabled(!fighting && !demoBattle)}>${paused ? "继续播放" : "暂停画面"}</button><button data-action="speed">${speed}× 速度</button></div>${resultMarkup(resultPresentation)}</div>
 <div class="arena-bottom"><span><i class="teal-dot"></i>己方阵地</span><span>已部署 <b>${onboard.length} / ${p.level}</b></span></div>
 <div class="bench-header"><span>备战席 <small>${bench.length} / 8</small></span><span>${chosen ? `已选择 ${UNIT[chosen.defId].name}` : "点击棋子选择 · 点击棋格部署"}</span></div><div class="bench">${Array.from(
   { length: 8 },
   (_, i) => {
     const x = bench[i];
     return `<div class="bench-item" ${x ? `data-bench-info="${x.uid}" tabindex="${busy ? 0 : -1}"` : ""}><button class="bench-slot ${x?.uid === selected ? "selected" : ""}" data-bench="${x?.uid ?? ""}" ${disabled(busy)} aria-label="${x ? UNIT[x.defId].name : "空备战位置"}">${x ? token(x) : `<span>${String(i + 1).padStart(2, "0")}</span>`}</button>${x ? `<button class="bench-info" data-piece-info="${x.uid}" aria-label="查看备战席${UNIT[x.defId].name}详情">详情</button>` : ""}</div>`;
   },
 ).join("")}</div>
 ${deploymentMarkup(p, selected, busy || !!demoBattle, deploymentOpen)}<div class="auto-deploy"><button data-action="auto-deploy" ${disabled(busy || !!demoBattle || !p.pieces.length)}>推荐布阵</button><button data-action="compact-deploy" ${disabled(busy || !!demoBattle || !p.pieces.length)}>抱团布阵</button><span class="micro">分散避群伤，抱团保护后排；均可继续手动调整</span></div><div class="selection">${chosen ? `<span><b>${UNIT[chosen.defId].name}</b> ${stars(chosen.star)} · ${UNIT[chosen.defId].traits.join(" / ")}</span><div><button data-action="unit-info">查看详情</button><button data-action="recall" ${disabled(busy || chosen.position === null)}>撤回备战席</button><button data-action="sell" ${disabled(busy)}>出售 +${UNIT[chosen.defId].cost * 3 ** (chosen.star - 1)} 金</button></div>` : "<span>招募 → 布阵 → 自动交战 → 升级阵容</span>"}</div></section>
 <aside class="right"><section class="panel leaderboard"><div class="section-label"><h2>战场情报</h2><span>${game.players.filter((x) => x.hp > 0).length} / 8 存活</span></div>${ranked.map((x, i) => `<div class="player ${x.id === 0 ? "you" : ""} ${x.hp === 0 ? "eliminated" : ""}"><span class="rank">${String(i + 1).padStart(2, "0")}</span><div><b>${x.name}</b><span class="player-bar"><i style="width:${x.hp}%"></i></span></div><strong>${x.hp}</strong>${x.id !== 0 ? `<button class="scout-button" data-scout="${x.id}" aria-label="侦察 ${x.name}" title="${AI_PROFILES[x.id].name}">侦察</button>` : ""}</div>`).join("")}</section><section class="panel report"><span class="eyebrow">${fighting || demoBattle ? "DAMAGE REPORT" : "BATTLE LOG"}</span><h2>${done ? `最终排名 #${ranked.findIndex((x) => x.id === 0) + 1}` : fighting || demoBattle ? "战斗贡献" : "作战简报"}</h2><div class="damage-stats">${
   fighting || demoBattle
     ? fighters
         .filter((f) => f.side === 0)
         .sort((a, b) => b.damage - a.damage)
         .slice(0, 5)
         .map(
           (f) =>
             `<div class="damage"><span>${UNIT[f.defId].name}<small>治疗 ${f.healing} · 承盾 ${f.absorbed}</small></span><b>${f.damage}</b></div>`,
         )
         .join("")
     : `<p role="status">${game.message}</p>`
 }</div>${game.phase === "result" ? `<p class="result-badge">${lastWinner === 0 ? "防守胜利" : lastWinner === null ? "战斗平局" : "防守失败"}</p>` : ""}</section></aside></main>
 ${equipmentMarkup(game, selected, busy || !!demoBattle)}
 <section class="shop panel" id="recruitment"><div class="shop-title"><div><span class="eyebrow">RECRUITMENT</span><h2>招募中心</h2></div><div><button data-action="lock" aria-pressed="${p.locked}" ${disabled(busy)}>${p.locked ? "已锁定商店" : "锁定商店"}</button><button data-action="refresh" ${disabled(busy || p.gold < 2)}>↻ 刷新 <span>2 金</span></button></div></div><p class="shop-odds">当前 ${p.level} 级招募概率：${ODDS[p.level - 1].map((n, i) => `${i + 1} 费 ${n}%`).join(" · ")}</p><div class="shop-cards">${p.shop
   .map((id, i) => {
     if (!id) return '<div class="card sold">已招募</div>';
     const u = UNIT[id],
       count = p.pieces
         .filter((x) => x.defId === id)
         .reduce((n, x) => n + 3 ** (x.star - 1), 0);
     return `<article class="shop-entry"><button class="card" data-buy="${i}" style="--unit:${u.color}" ${disabled(busy || p.gold < u.cost)}><div class="card-top"><span>${u.traits.join(" / ")}</span><b>${u.cost}<small> 金</small></b></div><div class="card-art"><img src="${spriteUrl(u.id)}" alt="${u.name}" draggable="false"><i></i></div><div class="card-bottom"><strong>${u.name}</strong><small>${count ? `持有 ${count} 枚` : "点击招募"}</small></div><div class="rarity">${"▰".repeat(u.cost)}</div></button><button class="shop-info" data-unit-info="${id}" aria-label="查看${u.name}详情">查看详情</button></article>`;
   })
   .join(
     "",
   )}</div></section><footer><span>RED TIDES / 战术演习</span><span class="save-status" role="status">${saveLabel()}</span><span>ImageGen 重制形象 · 2.5D 战场</span></footer><nav class="mobile-dock" aria-label="快捷导航"><span>${p.hp} 生命 · <b>${p.gold} 金</b> · ${onboard.length}/${p.level} 人口</span><div><button data-jump="battlefield">战场</button><button data-jump="recruitment">招募</button><button data-jump="armory">装备</button><button data-jump="commander">升级</button></div></nav></div>
 ${game.reward && !computing && !resultPresentation && !saveConflict && !settingsOpen && !unitInfo && scoutId === null && !historyOpen && !help && !codex ? rewardMarkup(game) : ""}
 ${settingsOpen ? settingsMarkup(preferences) : ""}
 ${unitInfo ? pieceInfoMarkup(unitInfo, game.combatVersion) : ""}
 ${scoutId !== null ? scoutingMarkup(game, scoutId) : ""}
 ${historyOpen ? historyMarkup(game) : ""}
 ${help || codex ? `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${help ? "作战指南" : "棋子图鉴"}"><button class="close" data-action="close" aria-label="关闭">×</button><span class="eyebrow">FIELD MANUAL</span><h2>${help ? "作战指南" : "棋子图鉴"}</h2>${help ? `<ol><li>在招募中心购买棋子。3 个同星同名棋子自动合成，最高三星。</li><li>点击备战席中的棋子，再点击棋盘下半区部署。上场数量不能超过等级。</li><li>点击场上棋子后可移动、交换、撤回或出售。重复棋子不增加羁绊计数。</li><li>点击开始战斗，观察走位与伤害。战斗期间不能更改阵容。</li><li>结算获得基础金币、利息、连胜或连败奖励。购买经验提升人口。</li><li>存活到最后获胜；第 30 回合按剩余生命排名。重新开始会清空本局。</li></ol><p>本版包含 ${UNITS.length} 种棋子、10 类羁绊与多档效果和共享卡池。棋子各有独立技能：护盾、治疗、眩晕、破甲、贯穿和突袭。蓝色条为护盾，紫色数字为法术伤害。操作后自动保存本局，刷新可恢复战斗与准备进度。本局战报可查看已结束回合与回放。野怪回合后选择装备；选中棋子后可在装备工坊穿戴、卸下或合成。每枚棋子最多 3 件装备，升星溢出装备和出售装备会归还库存。首轮开战前可选择休闲、标准或挑战难度；战场情报的侦察按钮可查看对手站位与装备。推荐布阵可自动挑选阵容并安排前后排。</p>` : codexMarkup()}</section></div>` : ""}`;
  scene = new BattleScene(
    document.querySelector<HTMLCanvasElement>("#battle-canvas")!,
    () => ({
      pieces: me().pieces,
      selected,
      battle:
        demoBattle ??
        (game.phase === "battle" ||
        game.phase === "result" ||
        game.phase === "finished"
          ? (result?.battle ?? null)
          : null),
      time: playbackTime,
      phase: demoBattle ? "demo" : game.phase,
      demo: !!demoBattle,
      paused,
    }),
    selectCell,
    () => preferences,
  );
  if (computing)
    app
      .querySelectorAll<HTMLButtonElement>("[data-watch-round]")
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
    unavailable: "本地存储不可用 · 本局暂不保存",
    conflict: "另一窗口已更新 · 等待载入",
  }[saves.status];
}
function saveCurrent() {
  if (saveConflict) return;
  const status = saves.save(game, {
    time: game.phase === "battle" && !demoBattle ? playbackTime : 0,
    speed: speed as PlaybackSave["speed"],
    paused: game.phase === "battle" && paused,
  });
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
function reset() {
  cancelComputation();
  saves.allowReplacement();
  saveConflict = false;
  saveNotice = "";
  closePanels();
  deploymentOpen = false;
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
  scoutId = null;
  historyOpen = false;
  help = false;
  codex = false;
  settingsOpen = false;
  unitInfo = null;
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
  const target = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!target || target.hasAttribute("disabled")) return;
  const p = me(),
    action = target.dataset.action;
  if (action === "cancel-compute") {
    cancelComputation();
    if (demoBattle) beginPlayback();
    render();
    return;
  }
  if (action === "retry-compute" && pendingJob) {
    const { job, apply, label } = pendingJob;
    runComputation(job, apply, label);
    return;
  }
  if (
    computing &&
    ![
      "settings",
      "help",
      "codex",
      "history",
      "close",
      "restart",
      "load",
      "sound-preview",
      "unit-info",
      "deployment",
      "dismiss-notice",
    ].includes(action ?? "") &&
    !target.dataset.jump &&
    !target.dataset.scout &&
    !target.dataset.unitInfo &&
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
  if (
    target.dataset.jump &&
    ["battlefield", "recruitment", "armory", "commander"].includes(
      target.dataset.jump,
    )
  ) {
    document.getElementById(target.dataset.jump)?.scrollIntoView({
      behavior: preferences.reducedMotion ? "instant" : "smooth",
      block: "start",
    });
    return;
  }
  if (action === "load") {
    window.location.reload();
    return;
  }
  if (
    saveConflict &&
    ![
      "help",
      "codex",
      "history",
      "settings",
      "unit-info",
      "deployment",
      "close",
    ].includes(action ?? "") &&
    !target.dataset.unitInfo &&
    !target.dataset.scout &&
    !target.dataset.pieceInfo
  )
    return;
  if (action === "deployment") deploymentOpen = !deploymentOpen;
  if (action === "settings") {
    closePanels();
    settingsOpen = true;
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
      star: 1,
      position: null,
    };
  }
  if (action === "dismiss-notice") saveNotice = "";
  if (target.dataset.scout !== undefined) {
    closePanels();
    scoutId = Number(target.dataset.scout);
    help = false;
    codex = false;
    historyOpen = false;
  }
  if (
    (action === "auto-deploy" || action === "compact-deploy") &&
    game.phase === "prepare" &&
    !demoBattle
  ) {
    deployLineup(
      p,
      game.difficulty === "relaxed" ? "standard" : game.difficulty,
      action === "compact-deploy" ? "compact" : "spread",
    );
    selected = null;
    message(
      action === "compact-deploy"
        ? "已抱团保护后排；注意敌方范围技能，可继续手动调整。"
        : "已按当前棋子分散布阵，可继续手动调整。",
    );
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
    target.dataset.watchRound !== undefined &&
    (game.phase === "prepare" || game.phase === "finished")
  ) {
    const report = game.history.find(
      (r) => r.round === Number(target.dataset.watchRound),
    );
    if (report) {
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
          playbackTime = 0;
          paused = false;
          beginPlayback();
        },
        `正在准备第 ${report.round} 回合回放…`,
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
  if (action === "demo") {
    resultPresentation = null;
    replayRound = null;
    if (demoBattle) {
      stopTimer();
      demoBattle = null;
      paused = false;
      playbackTime = result ? result.battle.frames.length - 1 : 0;
    } else {
      const { left, right } = demoArmies();
      runComputation(
        { kind: "replay", left, right, version: "signature" },
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
    if (window.confirm("重新开始将清空当前演习，是否继续？")) reset();
    return;
  }
  if (action === "next") {
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
  if (key === "cost") codexFilters.cost = input.value;
  if (key === "trait") codexFilters.trait = input.value;
  if (key === "star") codexFilters.star = Number(input.value);
  const grid = app.querySelector(".codex-grid");
  if (grid) grid.innerHTML = codexCards();
});
document.addEventListener("keydown", (e) => {
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
    const hadModal = !!app.querySelector('[role="dialog"]');
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
function demoArmies() {
  const left: Piece[] = [
    { uid: 101, defId: "guard", star: 2, position: 35 },
    { uid: 102, defId: "pangolin", star: 2, position: 34 },
    { uid: 103, defId: "panda", star: 2, position: 37 },
    { uid: 104, defId: "infantry", star: 2, position: 51 },
    { uid: 105, defId: "monk", star: 2, position: 44 },
    { uid: 106, defId: "cannon", star: 1, position: 60 },
    { uid: 107, defId: "cavalry", star: 2, position: 33 },
    { uid: 108, defId: "dragonfly", star: 2, position: 59 },
    { uid: 109, defId: "fish", star: 2, position: 58 },
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
    if (paused) return;
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
          round: game.round,
          damage: 0,
          income: 0,
          terminal: false,
          rank: 0,
          demo: true,
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
          ? "演示 · 十对十"
          : `战斗时间 ${(frame * 0.25).toFixed(1)}s`;
      const stats = document.querySelector(".damage-stats");
      if (stats)
        stats.innerHTML = battle.frames[frame].fighters
          .filter((f) => f.side === 0)
          .sort((a, b) => b.damage - a.damage)
          .slice(0, 6)
          .map(
            (f) =>
              `<div class="damage"><img src="${spriteUrl(f.defId)}" alt=""><span>${UNIT[f.defId].name}<small>治疗 ${f.healing} · 承盾 ${f.absorbed}</small></span><b>${f.damage}</b></div>`,
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
  audio.setHidden(document.hidden);
  const suspended = document.hidden && preferences.pauseHidden;
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
