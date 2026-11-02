import { DIFFICULTIES } from "../data/ai-profiles";
import { ITEM } from "../data/items";
import { UNIT } from "../data/units";
import { matchSummary } from "../engine/match-summary";
import type { Game } from "../engine/types";
import { synergies } from "../engine/synergies";

export function matchSummaryMarkup(game: Game): string {
  const summary = matchSummary(game);
  if (!summary) return "";
  const last = game.history.at(-1)!;
  const traits = synergies(summary.lineup, last.combatVersion).filter(
    (s) => s.active,
  );
  const reason =
    summary.reason === "eliminated"
      ? `第 ${summary.rounds} 回合生命耗尽，本局演习结束。`
      : summary.reason === "last-standing"
        ? "你是战场上最后一位指挥官。"
        : `已完成 ${summary.rounds} 回合，按剩余生命确定排名。`;
  const stats = [
    [
      "对战胜 / 负 / 平",
      `${summary.wins} / ${summary.losses} / ${summary.draws}`,
    ],
    ["野怪通关", `${summary.pveWins} / ${summary.pveRounds}`],
    ["最高对战连胜", String(summary.bestStreak)],
    ["累计结算金币", String(summary.totalIncome)],
    ["累计生命损失", String(summary.damageTaken)],
  ];
  return `<section class="match-summary ${summary.champion ? "is-champion" : ""}" aria-label="整局总结" tabindex="-1">
    <div class="match-heading"><div class="match-medal" aria-label="最终第 ${summary.rank} 名"><small>最终排名</small><strong><span>#</span>${summary.rank}</strong></div><div><span class="eyebrow">${summary.champion ? "VICTORY / 最终胜者" : "MATCH COMPLETE / 战术复盘"}</span><h2>${summary.champion ? "云海之巅" : "征程落幕，再战云海"}</h2><p>${reason}</p><small>${DIFFICULTIES[game.difficulty].name}难度 · ${summary.rounds} 回合 · 指挥官等级 ${game.players[0].level}</small></div><div class="match-actions"><button data-action="history">查看整局战报</button><button data-watch-round="${last.round}">回放最后一战</button></div></div>
    <dl class="match-metrics">${stats.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
    <div class="match-details"><div><h3>最终出战阵容 <small>${summary.lineup.length} 枚棋子</small></h3><div class="match-lineup">${summary.lineup
      .map((p) => {
        const u = UNIT[p.defId];
        return `<article style="--unit:${u.color}"><img src="/assets/units/${u.id}.png" alt="${u.name}" loading="lazy"><strong>${u.name}</strong><span class="stars">${"★".repeat(p.star)}</span><small>${(p.items ?? []).map((id) => ITEM[id].name).join(" · ") || "未携带装备"}</small></article>`;
      })
      .join(
        "",
      )}</div><p class="match-traits">${traits.length ? traits.map((s) => `${s.trait} ${s.count} · ${s.tier} 档`).join("　/　") : "未激活阵容连携"}</p><h3>回合历程 <small>点击回合可回放</small></h3><div class="match-timeline">${game.history
      .map((r) => {
        const outcome =
          r.winner === 0 ? "胜利" : r.winner === 1 ? "失败" : "平局";
        return `<button class="${r.winner === 0 ? "won" : r.winner === 1 ? "lost" : "draw"}" data-watch-round="${r.round}" title="第 ${r.round} 回合 · ${r.opponentName} · ${outcome} · 剩余 ${r.hp} 生命" aria-label="回放第 ${r.round} 回合，${r.kind === "pve" ? "野怪" : "对战"}${outcome}"><span>${r.round}</span><small>${r.kind === "pve" ? "野怪" : "对战"} · ${outcome}</small></button>`;
      })
      .join(
        "",
      )}</div></div><div class="match-standings"><h3>结束时战场排名</h3><ol>${summary.standings.map((p, i) => `<li class="${p.id === 0 ? "you" : ""}"><span>${String(i + 1).padStart(2, "0")}</span><div><b>${p.name}</b><small>${p.hp > 0 ? `剩余 ${p.hp} 生命` : `第 ${p.eliminatedRound} 回合淘汰`}</small></div>${p.id === 0 ? "<em>你</em>" : ""}</li>`).join("")}</ol><p class="micro">${summary.reason === "eliminated" ? "指挥官淘汰后演习结束，存活 AI 按当前生命排序。" : "剩余生命较高者排名靠前。"}同回合淘汰或生命相同时，按席位顺序排序。</p></div></div>
  </section>`;
}
