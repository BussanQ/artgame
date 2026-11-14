import "../style.css";
import "../battle-inspection.css";
import "./online.css";
import { ARENAS } from "../data/arenas";
import { ITEM, ITEMS } from "../data/items";
import { RULES, UNIT } from "../data/units";
import { unitSprite } from "../data/unit-stats";
import { simulate } from "../engine/battle";
import { canCraft } from "../engine/equipment";
import { synergies } from "../engine/synergies";
import { CURRENT_COMBAT_VERSION, type Battle } from "../engine/types";
import { BattleScene, spriteUrl } from "../render/scene";
import { loadPreferences } from "../ui/preferences";
import { FRAME_MS, type Order, type RoomView, type Ticket } from "./protocol";

const app = document.querySelector<HTMLDivElement>("#app")!;
const url = new URL(location.href);
const token = url.searchParams.get("token") ?? "";
const solo = new URL(url);
solo.searchParams.delete("mode");
solo.searchParams.delete("room");
const preferences = loadPreferences(localStorage, matchMedia("(prefers-reduced-motion: reduce)").matches);
const ticketKey = "red-tides.online.seat";
let ticket: Ticket | null = null;
try { ticket = JSON.parse(sessionStorage.getItem(ticketKey) ?? "null"); } catch { /* new tab */ }
let view: RoomView | null = null;
let scene: BattleScene | undefined;
let battle: Battle | null = null;
let battleKey = "";
let selected: number | null = null;
let busy = false;
let offset = 0;
let notice = "";
let requestActive = false;
let joinCode = url.searchParams.get("room")?.match(/^\d{6}$/)?.[0] ?? "";
const localTime = () => Date.now() + offset;

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function api<T>(route: string, data: object): Promise<T> {
  const response = await fetch("/api/online/" + route, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(data), cache: "no-store", signal: AbortSignal.timeout(20000),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("联机服务未连接，请检查房间服务和 Nginx 转发。");
  const value = await response.json();
  if (!response.ok) throw new RequestError(value.error ?? "连接房间失败", response.status);
  return value;
}
function clearSeat() {
  ticket = view = null;
  selected = null;
  battle = null;
  battleKey = "";
  sessionStorage.removeItem(ticketKey);
}
function showError(error: unknown) {
  if (error instanceof RequestError && [401, 404].includes(error.status)) clearSeat();
  notice = error instanceof Error ? error.message : "网络连接中断";
}
function accept(next: RoomView) {
  if (view && next.revision < view.revision) return;
  offset = next.serverTime - Date.now();
  const changed = view?.revision !== next.revision || !!notice;
  view = next;
  notice = "";
  if (selected !== null && !next.player?.pieces.some(p => p.uid === selected)) selected = null;
  const key = next.duel ? next.code + ":" + next.round : "";
  if (key !== battleKey) {
    battleKey = key;
    battle = next.duel ? simulate(next.duel.left, next.duel.right, CURRENT_COMBAT_VERSION) : null;
  }
  if (changed) render();
}
async function poll() {
  if (!ticket || busy || requestActive) return;
  requestActive = true;
  const active = ticket;
  try {
    const state = await api<RoomView>("state", active);
    if (ticket === active && !busy) accept(state);
  } catch (error) { if (ticket === active && !busy) { showError(error); render(); } }
  finally { requestActive = false; }
}
async function enter(create: boolean) {
  if (busy || ticket) return;
  busy = true;
  try {
    ticket = await api<Ticket>(create ? "create" : "join", create ? {} : { code: joinCode });
    sessionStorage.setItem(ticketKey, JSON.stringify(ticket));
    notice = "";
  } catch (error) { showError(error); }
  finally { busy = false; render(); }
  await poll();
}
async function order(action: Order) {
  if (!view || !ticket || busy) return;
  busy = true;
  try {
    const state = await api<RoomView>("order", { ...ticket, order: action, round: view.round,
      phase: view.phase, sequence: view.sequence });
    if (action.kind === "leave") { clearSeat(); notice = ""; render(); }
    else accept(state);
  } catch (error) { showError(error); render(); }
  finally { busy = false; }
}
function chooseCell(position: number) {
  if (view?.phase !== "prepare" || busy || view.seats.find(p => p.id === view?.me)?.ready) return;
  const piece = view.player?.pieces.find(p => p.position === position);
  if (selected !== null && selected !== piece?.uid && position >= 32) {
    void order({ kind: "move", uid: selected, position });
  } else { selected = piece?.uid ?? null; render(); }
}
const button = (key: string, label: string, disabled = false) =>
  `<button data-do="${key}" ${disabled ? "disabled" : ""}>${label}</button>`;
function seats(v: RoomView) {
  return `<ol class="on-seats">${v.seats.map(s => `<li class="${s.id === v.me ? "mine" : ""}"><span>${s.name}${s.id === v.me ? " · 你" : ""}</span><small>${v.phase === "lobby" ? (s.id === v.host ? "房主" : s.human ? "真人" : "AI") : s.hp <= 0 ? "已淘汰" : s.ready && v.phase === "prepare" ? "已准备" : s.hp + " 生命"}</small></li>`).join("")}</ol>`;
}
function clock() {
  const el = app.querySelector("[data-clock]");
  if (el && view) el.textContent = Math.max(0, Math.ceil((view.until - localTime()) / 1000)) + " 秒";
}
function render() {
  scene?.destroy();
  const v = view;
  const nav = `<header class="on-header"><div><span class="on-mark">赤</span><strong>赤潮</strong> 联机对战</div><div>${v ? `<b>房间 ${v.code}</b>${button("leave", "退出房间")}` : ""}<a data-solo>单人演习</a></div></header>`;
  let content: string;
  if (!v) {
    content = ticket ? '<p>正在连接房间…</p>' : `<section class="on-lobby"><h1>联机大厅</h1><p>邀请朋友同场对战，空位由电脑补齐至 8 人。</p>${button("create", "创建房间")}<form><label for="room-code">房间号</label><input id="room-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="6 位数字" required value="${joinCode}"><button>加入房间</button></form></section>`;
  } else if (v.phase === "lobby") {
    const count = v.seats.filter(s => s.human).length;
    content = `<section class="on-lobby"><h1>房间 ${v.code}</h1><p>将房间号发给朋友，在联机大厅输入即可加入。</p><h2>${count} 位玩家 · ${8-count} 个电脑席位</h2>${seats(v)}${v.me === v.host ? button("start", "开始比赛") : "<p>等待房主开局</p>"}</section>`;
  } else {
    const p = v.player!, chosen = p.pieces.find(x => x.uid === selected);
    const ready = v.seats.find(s => s.id === v.me)!.ready;
    const editable = v.phase === "prepare" && p.hp > 0 && !ready;
    const onboard = p.pieces.filter(x => x.position !== null);
    const duel = v.duel;
    const phase = {prepare: "部署阶段", battle: "自动战斗", result: "回合结算", finished: "最终排名"}[v.phase];
    const outcome = duel ? (duel.winner === null ? "平局" : duel.winner === duel.side ? "胜利" : "失败") : "";
    const traits = synergies(p.pieces).filter(s => s.active).map(s => s.trait + " " + s.count).join(" · ");
    const line = duel ? duel.names.map((n,i) => n + (i === duel.side ? "（你）" : "")).join(" 对阵 ") : "点击备战棋子，再点击己方半场部署";
    content = `<div class="on-round"><strong>第 ${v.round} / ${RULES.maxRounds} 回合</strong><b>${phase}</b>${v.phase !== "finished" ? '<span data-clock></span>' : ""}<span>${(v.bans ?? []).join(" / ")} 禁用</span></div>
    <div class="on-grid"><section><div class="on-stage battle-viewport"><canvas aria-label="战术棋盘"></canvas>${v.phase === "result" || v.phase === "finished" ? `<strong class="on-outcome">${v.phase === "finished" ? "最终第 " + (v.seats.findIndex(s=>s.id === v.me)+1) + " 名" : outcome}</strong>` : ""}</div>
    <p>${p.hp <= 0 ? "已淘汰 · 可继续查看排名" : line}</p>
    <h2>备战席 · ${p.pieces.length-onboard.length}/8</h2><div class="on-controls">${p.pieces.filter(x=>x.position===null).map(x=>button("piece:"+x.uid, (selected===x.uid ? "✓ " : "") + UNIT[x.defId].name + "★".repeat(x.star),!editable)).join("") || "<small>暂无备战棋子</small>"}</div>
    <div class="on-controls">${chosen ? `<b>${UNIT[chosen.defId].name}</b>${button("bench","撤回备战席", !editable || chosen.position === null)}${button("sell","出售",!editable)}${(chosen.items??[]).map((item,i)=>button("unequip:"+i,"卸下"+ITEM[item].name,!editable)).join("")}` : ""}</div>
    <p>阵容连携 · ${traits || "暂无激活"}</p></section>
    <aside><h2>招募中心</h2><p><b>${p.gold} 金</b> · 等级 ${p.level} · 已部署 ${onboard.length}/${p.level}</p>
    <div class="on-shop">${p.shop.map((id,i)=>id ? `<button data-do="buy:${i}" ${!editable || p.gold < UNIT[id].cost ? "disabled" : ""}><img src="${spriteUrl(unitSprite(id,CURRENT_COMBAT_VERSION))}" alt=""><span><b>${UNIT[id].name}</b><small>${UNIT[id].traits.join(" / ")}</small></span><b>${UNIT[id].cost} 金</b></button>` : "<div>已招募</div>").join("")}</div>
    <div class="on-controls">${button("roll","刷新 · 2 金",!editable || p.gold<2)}${button("lock",p.locked?"解锁商店":"锁定商店",!editable)}${button("xp","经验 · 5 金",!editable || p.gold<5 || p.level===10)}${button("deploy","推荐布阵",!editable || !p.pieces.length)}${button("ready",ready && v.phase==="prepare"?"已准备":"准备完毕",!editable || !onboard.length)}</div>
    ${p.inventory.length ? `<h2>装备工坊</h2><small>选中棋子后点击装备穿戴</small><div class="on-controls">${p.inventory.map((id,i)=>button("equip:"+i,ITEM[id].name,!editable || !chosen)).join("")}${ITEMS.filter(item=>canCraft(p,item.id)).map(item=>button("craft:"+item.id,"合成"+item.name,!editable)).join("")}</div>` : ""}
    <h2>${v.phase === "finished" ? "最终排名" : "战场情报"}</h2>${seats(v)}</aside></div>`;
  }
  app.innerHTML = `<main class="online">${nav}<p class="on-notice" role="status"></p>${content}</main>`;
  app.querySelector<HTMLElement>(".on-notice")!.textContent = notice;
  app.querySelector<HTMLAnchorElement>("[data-solo]")!.href = solo.href;
  const canvas = app.querySelector("canvas");
  if (canvas && v?.player) scene = new BattleScene(canvas, () => ({
    pieces: v.player!.pieces, selected, battle, phase: v.phase, demo: false, paused: false,
    time: battle ? Math.min(battle.frames.length - 1, Math.max(0,(localTime()-v.battleStart)/FRAME_MS)) : 0,
  }), chooseCell, ARENAS[0].image, () => preferences);
  clock();
}
app.addEventListener("input", e => {
  if (e.target instanceof HTMLInputElement) joinCode = e.target.value = e.target.value.replace(/\D/g,"");
});
app.addEventListener("submit", e => { e.preventDefault(); void enter(false); });
app.addEventListener("click", e => {
  const target = (e.target as Element).closest<HTMLButtonElement>("button[data-do]");
  if (!target || busy) return;
  const [key, arg] = target.dataset.do!.split(":");
  const index = Number(arg);
  switch (key) {
    case "create": void enter(true); break;
    case "piece": selected = selected === index ? null : index; render(); break;
    case "buy": void order({ kind: key, index }); break;
    case "craft": void order({ kind: key, item: arg }); break;
    case "bench": if (selected !== null) void order({ kind:"move", uid:selected, position:null }); break;
    case "sell": if (selected !== null) void order({kind:key, uid:selected}); break;
    case "equip": case "unequip": if (selected !== null) void order({kind:key, uid:selected, index}); break;
    case "start": case "leave": case "ready": case "roll": case "lock": case "xp": case "deploy":
      void order({kind:key}); break;
  }
});
document.title = "赤潮 · 联机对战";
render();
void poll();
setInterval(() => { clock(); void poll(); }, 800);
