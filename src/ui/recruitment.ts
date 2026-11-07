import { catalogUnit } from "../data/catalog";
import { unitSprite } from "../data/unit-stats";
import { ODDS, RULES, UNIT } from "../data/units";
import { unitDefinition } from "../data/unit-stats";
import { previewPurchase } from "../engine/recruitment";
import { insectCount, isInsect, mergeCount } from "../engine/progression";
import type { Game, Player } from "../engine/types";

function insectEvolutionMarkup(game: Game, player: Player) {
  const kinds = insectCount(player.pieces);
  if (!kinds && !player.shop.some((id) => id && isInsect(id))) return "";
  const first = mergeCount(player.pieces, "eyebug", 1, game.combatVersion),
    second = mergeCount(player.pieces, "eyebug", 2, game.combatVersion);
  const hint =
    kinds < 2
      ? `再收集${2 - kinds}种不同异虫，即可开启一星2合1。`
      : first === 3
        ? "本回合按三枚同名同星合成。"
        : kinds < 4
          ? `再收集${4 - kinds}种不同异虫，二星也可2合1。`
          : "两档进化均已激活，最高三星。";
  return `<aside class="insect-evolution ${first === 2 ? "active" : ""}" aria-label="异虫进化" title="${hint}场上与备战席一起计数，同名只算1种。"><strong>异虫进化 · 已持有 ${kinds}/${first === 2 ? 4 : 2} 种</strong><p>一星 → 二星：${first}枚同名一星 · 二星 → 三星：${second}枚同名二星</p><span>${hint}场上与备战席一起计数，同名只算1种。</span></aside>`;
}

export function recruitmentMarkup(game: Game, player: Player, busy: boolean) {
  const disabled = (value: boolean) => (value ? "disabled" : "");
  const cards = player.shop
    .map((id, index) => {
      if (!id) return '<div class="card sold">已招募</div>';
      const unit = catalogUnit(game, id),
        quote = previewPurchase(game, player, index);
      const owned = [1, 2, 3]
        .map((star) => {
          const count = player.pieces.filter(
            (p) => p.defId === id && p.star === star,
          ).length;
          return count ? `${star}星 ×${count}` : "";
        })
        .filter(Boolean)
        .join(" · ");
      const upgrades = quote.upgrades
        .map((p) => `${UNIT[p.defId].name} ${p.star}星`)
        .join("、");
      const evolution =
        isInsect(id) && quote.after
          ? [1, 2]
              .filter(
                (star) =>
                  mergeCount(player.pieces, id, star, game.combatVersion) ===
                    3 &&
                  mergeCount(
                    quote.after!.pieces,
                    id,
                    star,
                    game.combatVersion,
                  ) === 2,
              )
              .map((star) => `购入后激活：${star}星异虫2合1`)
              .join("；")
          : "";
      const hint = `purchase-hint-${index}`;
      return `<article class="shop-entry ${quote.upgrades.length ? "can-upgrade" : ""}"><button class="card" data-buy="${index}" style="--unit:${unit.color}" ${disabled(busy || !quote.allowed)} aria-describedby="${hint}"><div class="card-top"><span>${unit.traits.join(" / ")}</span><b>${unit.cost}<small> 金</small></b></div><div class="card-art"><img src="/assets/units/${unitSprite(id, game.combatVersion)}.png" alt="${unit.name}" draggable="false"><i></i></div><div class="card-bottom"><strong>${unit.name}</strong><small>${quote.upgrades.length ? "可升星" : "点击招募"}</small></div><div class="rarity">${"▰".repeat(unit.cost)}</div></button><div class="purchase-hint" id="${hint}"><span>${owned ? `持有 ${owned}` : "尚未持有"}</span>${upgrades ? `<strong>购入后：${upgrades}</strong>` : ""}${evolution ? `<strong>${evolution}</strong>` : ""}<span>${busy ? "准备阶段可招募" : quote.reason || `购入后备战 ${quote.benchAfter}/${RULES.bench}`}</span>${quote.interestAfter < quote.interestBefore && player.gold >= quote.cost ? `<span class="interest-warning">购入后利息 ${quote.interestBefore} → ${quote.interestAfter} 金</span>` : ""}</div><button class="shop-info" data-unit-info="${id}" aria-label="查看${unit.name}详情">查看详情</button></article>`;
    })
    .join("");
  return `<section class="shop panel" id="recruitment"><div class="shop-title"><div><span class="eyebrow">RECRUITMENT</span><h2>招募中心${game.debugShopQueue?.length ? `<small class="debug-shop-count" title="下次成功刷新将使用后台指令">定向 ${game.debugShopQueue.length} 枚</small>` : ""}</h2></div><div><button data-action="lock" aria-pressed="${player.locked}" ${disabled(busy)}>${player.locked ? "已锁定商店" : "锁定商店"}</button><button data-action="refresh" ${disabled(busy || player.gold < RULES.reroll)}>↻ 刷新 <span>${RULES.reroll} 金</span></button></div></div><p class="shop-odds">当前 ${player.level} 级招募概率：${ODDS[player.level - 1].map((n, i) => `${i + 1} 费 ${n}%`).join(" · ")}</p><p class="shop-guide">升星包含连锁合成与异虫进化 · 预览不消耗金币 · 利息按当前余额估算</p>${insectEvolutionMarkup(game, player)}<div class="shop-cards">${cards}</div></section>`;
}
