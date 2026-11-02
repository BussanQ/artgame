import "./style.css";
import {
  resultMarkup,
  RESULT_DURATION_MS,
  type ResultPresentation,
} from "./ui/battle-result";
import { BenchTooltip } from "./ui/bench-tooltip";
import "./visual.css";
import { BattleScene, spriteUrl } from "./render/scene";
import { simulate } from "./engine/battle";
import type { Battle, Game } from "./engine/types";
import { UNIT, UNITS, RULES, XP } from "./data/units";
import {
  createGame,
  buy,
  move,
  roll,
  sell,
  buyXp,
  startRound,
  settle,
  nextRound,
  rankings,
} from "./engine/game";
import type { RoundResult } from "./engine/game";
import { synergies } from "./engine/synergies";
import type { Fighter, Piece } from "./engine/types";
const app = document.querySelector<HTMLDivElement>("#app")!;
let game = createGame(),
  selected: number | null = null,
  result: RoundResult | null = null,
  frame = 0,
  speed = 1,
  help = false,
  codex = false;
let timer: ReturnType<typeof setInterval> | undefined;
let scene: BattleScene | undefined;
let playbackTime = 0;
let demoBattle: Battle | null = null;
let paused = false;
let resultPresentation: ResultPresentation | null = null;
let advanceTimer: ReturnType<typeof setTimeout> | undefined;
const benchTooltip = new BenchTooltip(app, (uid) =>
  me().pieces.find((p) => p.uid === uid && p.position === null),
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
  benchTooltip.hide();
  scene?.destroy();
  const p = me(),
    busy = game.phase !== "prepare",
    fighting = game.phase === "battle",
    done = game.phase === "finished";
  const chosen = p.pieces.find((x) => x.uid === selected),
    onboard = p.pieces.filter((x) => x.position !== null),
    bench = p.pieces.filter((x) => x.position === null);
  const shownBattle = demoBattle ?? (fighting ? result?.battle : null);
  const fighters = shownBattle
    ? shownBattle.frames[
        Math.min(Math.floor(playbackTime), shownBattle.frames.length - 1)
      ].fighters
    : [];
  const active = synergies(p.pieces);
  const ranked = rankings(game);
  app.innerHTML = `<div class="shell"><header><a class="brand" href="/" aria-label="赤潮战术演习主页"><span class="brand-mark">赤</span><span>赤潮 <b>RED TIDES</b><small>战 争 艺 术 / AUTO CHESS</small></span></a><div class="mode"><i></i>单人演习 <span>你 + 7 位 AI</span></div><nav><button data-action="demo" ${disabled(fighting || game.phase === "result")}>${demoBattle ? "退出演示" : "观看战斗演示"}</button><button data-action="codex">棋子图鉴</button><button data-action="help">作战指南</button><button data-action="restart">重新开始</button></nav></header>
 <div class="command"><div><span class="eyebrow">RED TIDES / 云海遗迹</span><h1>${demoBattle ? "六对六 · 兵种演习" : done ? "演习结束" : fighting ? "交战进行中" : game.phase === "result" ? "战斗结算" : "部署你的下一步"}</h1></div><div class="round"><small>回合</small><strong>${String(game.round).padStart(2, "0")}</strong><span>/ ${RULES.maxRounds}</span></div><div class="phase"><span class="phase-dot"></span>${demoBattle ? "战斗演示" : { prepare: "准备阶段", battle: "自动战斗", result: "回合结算 · 即将进入准备", finished: "最终战报" }[game.phase]}<small class="battle-clock">${demoBattle ? "演示 · 六对六" : fighting ? `战斗时间 ${(frame * RULES.tickSeconds).toFixed(1)}s` : "从组合中找到胜机"}</small></div><button class="primary start" data-action="next" ${disabled(fighting || (!onboard.length && !done && game.phase === "prepare"))}>${done ? "开始新演习" : game.phase === "result" ? "下一回合 →" : "开始战斗 →"}</button></div>
 <main><aside class="left"><section class="panel commander"><span class="eyebrow">COMMANDER</span><h2>指挥官 <span>01</span></h2><div class="vitals"><strong>${p.hp}<small>生命值</small></strong><strong class="gold">${p.gold}<small>金币</small></strong></div><div class="life"><i style="width:${p.hp}%"></i></div><div class="level"><span>等级 <b>${p.level}</b></span><span>${p.level === 10 ? "MAX" : `${p.xp} / ${XP[p.level]} XP`}</span></div><div class="xp"><i style="width:${p.level === 10 ? 100 : (p.xp / XP[p.level]) * 100}%"></i></div><button class="wide" data-action="xp" ${disabled(busy || p.gold < 5 || p.level === 10)}>购买经验 <span>5 金 / 5 XP</span></button><p class="micro">预计利息 +${Math.min(5, Math.floor(p.gold / 10))} 金 · ${p.streak >= 0 ? "连胜" : "连败"} ${Math.abs(p.streak)}</p></section>
 <section class="panel synergies"><div class="section-label"><h2>阵容连携</h2><span>${active.filter((s) => s.active).length} 已激活</span></div>${active.length ? active.map((s) => `<div class="synergy ${s.active ? "active" : ""}"><span class="trait-icon">${s.active ? "◆" : "◇"}</span><div><b>${s.trait}</b><small>${s.description}</small></div><em>${s.count}/${s.threshold}</em></div>`).join("") : '<p class="empty">部署不同棋子，<br>组合兵种与职业连携。</p>'}<p class="micro">同名棋子仅计数一次</p></section>
 <section class="panel intel"><span class="eyebrow">FIELD NOTES</span><p>前排承伤，后排输出。<br>三枚相同棋子自动升星。</p><span class="prototype">云海遗迹 · 单人演习</span></section></aside>
 <section class="arena"><div class="arena-label"><span><i class="red-dot"></i>${fighting ? result!.opponent.name : "敌方阵地"}</span><span>${fighting ? "实时战况" : "8 × 8 战术棋盘"} <button class="speed" data-action="speed">${speed}×</button></span></div><div class="battle-stage ${demoBattle ? "is-demo" : ""}"><canvas id="battle-canvas" role="img" aria-label="斜俯视战场：点击己方棋格部署选中的棋子"></canvas><div class="stage-title"><span>云海遗迹</span><small>THE CLOUD SANCTUARY</small></div><div class="stage-status">${demoBattle ? "兵种战斗演示 · 不影响当前对局" : fighting ? "交战中" : game.phase === "result" ? "战果展示 · 即将进入准备" : done ? "演习结束" : "部署阶段 · 己方半场可落子"}</div><div class="stage-controls"><button data-action="pause" ${disabled(!fighting && !demoBattle)}>${paused ? "继续播放" : "暂停画面"}</button><button data-action="speed">${speed}× 速度</button></div><div class="board-keyboard" role="grid" aria-label="键盘部署棋盘">${Array.from({ length: 64 }, (_, i) => `<button role="gridcell" data-cell="${i}" aria-label="${i < 32 ? "敌方" : "己方"} ${Math.floor(i / 8) + 1}行${(i % 8) + 1}列" ${disabled(busy || !!demoBattle || i < 32)}>${i + 1}</button>`).join("")}</div>${resultMarkup(resultPresentation)}</div>
 <div class="arena-bottom"><span><i class="teal-dot"></i>己方阵地</span><span>已部署 <b>${onboard.length} / ${p.level}</b></span></div>
 <div class="bench-header"><span>备战席 <small>${bench.length} / 8</small></span><span>${chosen ? `已选择 ${UNIT[chosen.defId].name}` : "点击棋子选择 · 点击棋格部署"}</span></div><div class="bench">${Array.from(
   { length: 8 },
   (_, i) => {
     const x = bench[i];
     return `<div class="bench-item" ${x ? `data-bench-info="${x.uid}" tabindex="${busy ? 0 : -1}"` : ""}><button class="bench-slot ${x?.uid === selected ? "selected" : ""}" data-bench="${x?.uid ?? ""}" ${disabled(busy)} aria-label="${x ? UNIT[x.defId].name : "空备战位置"}">${x ? token(x) : `<span>${String(i + 1).padStart(2, "0")}</span>`}</button></div>`;
   },
 ).join("")}</div>
 <div class="selection">${chosen ? `<span><b>${UNIT[chosen.defId].name}</b> ${stars(chosen.star)} · ${UNIT[chosen.defId].traits.join(" / ")}</span><div><button data-action="recall" ${disabled(busy || chosen.position === null)}>撤回备战席</button><button data-action="sell" ${disabled(busy)}>出售 +${UNIT[chosen.defId].cost * 3 ** (chosen.star - 1)} 金</button></div>` : "<span>招募 → 布阵 → 自动交战 → 升级阵容</span>"}</div></section>
 <aside class="right"><section class="panel leaderboard"><div class="section-label"><h2>战场情报</h2><span>${game.players.filter((x) => x.hp > 0).length} / 8 存活</span></div>${ranked.map((x, i) => `<div class="player ${x.id === 0 ? "you" : ""} ${x.hp === 0 ? "eliminated" : ""}"><span class="rank">${String(i + 1).padStart(2, "0")}</span><div><b>${x.name}</b><span class="player-bar"><i style="width:${x.hp}%"></i></span></div><strong>${x.hp}</strong></div>`).join("")}</section><section class="panel report"><span class="eyebrow">${fighting || demoBattle ? "DAMAGE REPORT" : "BATTLE LOG"}</span><h2>${done ? `最终排名 #${ranked.findIndex((x) => x.id === 0) + 1}` : fighting || demoBattle ? "伤害统计" : "作战简报"}</h2><div class="damage-stats">${
   fighting || demoBattle
     ? fighters
         .filter((f) => f.side === 0)
         .sort((a, b) => b.damage - a.damage)
         .slice(0, 5)
         .map(
           (f) =>
             `<div class="damage"><span>${UNIT[f.defId].name}</span><b>${f.damage}</b></div>`,
         )
         .join("")
     : `<p role="status">${game.message}</p>`
 }</div>${game.phase === "result" ? `<p class="result-badge">${result?.battle.winner === 0 ? "防守胜利" : result?.battle.winner === null ? "战斗平局" : "防守失败"}</p>` : ""}</section></aside></main>
 <section class="shop panel"><div class="shop-title"><div><span class="eyebrow">RECRUITMENT</span><h2>招募中心</h2></div><div><button data-action="lock" aria-pressed="${p.locked}" ${disabled(busy)}>${p.locked ? "已锁定商店" : "锁定商店"}</button><button data-action="refresh" ${disabled(busy || p.gold < 2)}>↻ 刷新 <span>2 金</span></button></div></div><div class="shop-cards">${p.shop
   .map((id, i) => {
     if (!id) return '<div class="card sold">已招募</div>';
     const u = UNIT[id],
       count = p.pieces
         .filter((x) => x.defId === id)
         .reduce((n, x) => n + 3 ** (x.star - 1), 0);
     return `<button class="card" data-buy="${i}" style="--unit:${u.color}" ${disabled(busy || p.gold < u.cost)}><div class="card-top"><span>${u.traits.join(" / ")}</span><b>${u.cost}<small> 金</small></b></div><div class="card-art"><img src="${spriteUrl(u.id)}" alt="${u.name}" draggable="false"><i></i></div><div class="card-bottom"><strong>${u.name}</strong><small>${count ? `持有 ${count} 枚` : "点击招募"}</small></div><div class="rarity">${"▰".repeat(u.cost)}</div></button>`;
   })
   .join(
     "",
   )}</div></section><footer><span>RED TIDES / 战术演习</span><span>ImageGen 重制形象 · 2.5D 战场</span></footer></div>
 ${help || codex ? `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${help ? "作战指南" : "棋子图鉴"}"><button class="close" data-action="close" aria-label="关闭">×</button><span class="eyebrow">FIELD MANUAL</span><h2>${help ? "作战指南" : "棋子图鉴"}</h2>${help ? `<ol><li>在招募中心购买棋子。3 个同星同名棋子自动合成，最高三星。</li><li>点击备战席中的棋子，再点击棋盘下半区部署。上场数量不能超过等级。</li><li>点击场上棋子后可移动、交换、撤回或出售。重复棋子不增加羁绊计数。</li><li>点击开始战斗，观察走位与伤害。战斗期间不能更改阵容。</li><li>结算获得基础金币、利息、连胜或连败奖励。购买经验提升人口。</li><li>存活到最后获胜；第 30 回合按剩余生命排名。重新开始会清空本局。</li></ol><p>本版包含 12 种原型棋子、8 种简化连携和共享卡池。装备、野怪、原版独立技能和在线多人仍在后续开发计划中。刷新页面会重新开始。</p>` : `<p>以下属性为原型暂定值。技能名称为表现标签，当前统一为满能量 2.2 倍伤害。</p><div class="codex-grid">${UNITS.map((u) => `<article><img class="codex-portrait" src="${spriteUrl(u.id)}" alt="${u.name}"><strong style="color:${u.color}">${u.name}</strong><small>${u.cost} 金 · ${u.traits.join(" / ")}</small><p>生命 ${u.hp} · 攻击 ${u.attack}<br>护甲 ${u.armor} · 射程 ${u.range}<br>${u.skill}</p></article>`).join("")}</div>`}</section></div>` : ""}`;
  scene = new BattleScene(
    document.querySelector<HTMLCanvasElement>("#battle-canvas")!,
    () => ({
      pieces: me().pieces,
      selected,
      battle:
        demoBattle ??
        (game.phase === "battle" || game.phase === "result"
          ? (result?.battle ?? null)
          : null),
      time: playbackTime,
      phase: demoBattle ? "demo" : game.phase,
      demo: !!demoBattle,
    }),
    selectCell,
  );
}
function message(text: string) {
  game.message = text;
}
function stopTimer() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
function reset() {
  resultPresentation = null;
  clearTimeout(advanceTimer);
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
function finish() {
  stopTimer();
  if (!result || game.phase !== "battle") return;
  const previousHp = me().hp,
    previousGold = me().gold;
  settle(game, result);
  selected = null;
  const settledPhase = (game as Game).phase;
  resultPresentation = {
    winner: result.battle.winner,
    startedAt: performance.now(),
    round: game.round,
    damage: previousHp - me().hp,
    income: me().gold - previousGold,
    terminal: settledPhase === "finished",
    rank: rankings(game).findIndex((p) => p.id === 0) + 1,
  };
  if (settledPhase === "result") {
    game.message += " 战果展示后自动进入下一回合准备。";
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(advanceRound, RESULT_DURATION_MS);
  }
  render();
}
function advanceRound() {
  clearTimeout(advanceTimer);
  advanceTimer = undefined;
  if (game.phase !== "result") return;
  resultPresentation = null;
  stopTimer();
  demoBattle = null;
  nextRound(game);
  result = null;
  playbackTime = 0;
  frame = 0;
  paused = false;
  render();
}
app.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!target || target.hasAttribute("disabled")) return;
  const p = me(),
    action = target.dataset.action;
  if (target.dataset.buy !== undefined) {
    if (!buy(game, p, Number(target.dataset.buy)))
      message("购买失败：检查金币或备战席空间。");
    else message("招募完成。点击备战棋子，再选择部署位置。");
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
    if (demoBattle) {
      stopTimer();
      demoBattle = null;
      paused = false;
      playbackTime = result ? result.battle.frames.length - 1 : 0;
    } else {
      demoBattle = createDemo();
      paused = false;
      playbackTime = 0;
      beginPlayback();
    }
  }
  if (action === "pause") paused = !paused;
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
  if (action === "help") help = true;
  if (action === "codex") codex = true;
  if (action === "close") {
    help = false;
    codex = false;
  }
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
    } else if (game.phase === "prepare") {
      stopTimer();
      demoBattle = null;
      resultPresentation = null;
      result = startRound(game);
      if (result) {
        frame = 0;
        selected = null;
        demoBattle = null;
        playbackTime = 0;
        paused = false;
        beginPlayback();
      }
    }
  }
  render();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    help = false;
    codex = false;
    selected = null;
    render();
  }
});
function selectCell(pos: number) {
  if (game.phase !== "prepare" || demoBattle || pos < 32) return;
  const p = me(),
    at = p.pieces.find((x) => x.position === pos);
  if (selected !== null) {
    if (!move(game, p, selected, pos))
      message("部署失败：人口已满，或该位置不可用。");
    else selected = null;
  } else if (at) selected = at.uid;
  render();
}
function createDemo(): Battle {
  const left: Piece[] = [
    { uid: 101, defId: "guard", star: 2, position: 35 },
    { uid: 102, defId: "pangolin", star: 2, position: 34 },
    { uid: 103, defId: "panda", star: 2, position: 37 },
    { uid: 104, defId: "infantry", star: 2, position: 51 },
    { uid: 105, defId: "monk", star: 2, position: 44 },
    { uid: 106, defId: "cannon", star: 1, position: 60 },
  ];
  const right: Piece[] = [
    { uid: 201, defId: "titan", star: 1, position: 35 },
    { uid: 202, defId: "lion", star: 2, position: 36 },
    { uid: 203, defId: "wolf", star: 2, position: 33 },
    { uid: 204, defId: "sniper", star: 2, position: 58 },
    { uid: 205, defId: "master", star: 1, position: 45 },
    { uid: 206, defId: "chariot", star: 2, position: 61 },
  ];
  return simulate(left, right);
}
function beginPlayback() {
  stopTimer();
  let last = performance.now(),
    lastFrame = -1;
  timer = setInterval(() => {
    const now = performance.now(),
      elapsed = Math.min(100, now - last);
    last = now;
    if (demoBattle && resultPresentation?.demo) {
      if (now - resultPresentation.startedAt >= RESULT_DURATION_MS) {
        resultPresentation = null;
        playbackTime = 0;
        frame = 0;
        lastFrame = -1;
        render();
      }
      return;
    }
    if (paused) return;
    const battle = demoBattle ?? result?.battle;
    if (!battle) return;
    playbackTime += (elapsed / 250) * speed;
    const end = battle.frames.length - 1;
    // Allow the final arcing shell and its impact to finish before settlement.
    if (playbackTime > end + 5) {
      if (demoBattle) {
        playbackTime = end;
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
          ? "演示 · 六对六"
          : `战斗时间 ${(frame * 0.25).toFixed(1)}s`;
      const stats = document.querySelector(".damage-stats");
      if (stats)
        stats.innerHTML = battle.frames[frame].fighters
          .filter((f) => f.side === 0)
          .sort((a, b) => b.damage - a.damage)
          .slice(0, 6)
          .map(
            (f) =>
              `<div class="damage"><img src="${spriteUrl(f.defId)}" alt=""><span>${UNIT[f.defId].name}</span><b>${f.damage}</b></div>`,
          )
          .join("");
    }
  }, 16);
}

render();
