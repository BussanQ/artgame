import { baseIncome, INCOME_TIERS } from "../engine/economy";

export function incomeMarkup(round: number): string {
  const next = INCOME_TIERS.find((tier) => tier.round > round);
  return `<div class="round-income"><span>本轮基础奖励</span><strong>+${baseIncome(round)} 金</strong><small>${next ? `第 ${next.round} 回合增至 +${next.gold} 金` : "已达基础奖励上限"}</small></div>`;
}
