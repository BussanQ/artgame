import { salePrice } from "../engine/progression";
import { TRAIT_TIERS, AIRSEA_TRAIT_TIERS } from "../data/traits";
import { equipmentStats, ITEM } from "../data/items";
import { skillDescription, skillName } from "../data/skills";
import { isRanged, RANGED_ACTIONS } from "../render/ranged";
import { RULES, UNIT } from "../data/units";
import type { Piece, CombatVersion } from "../engine/types";
import { isMelee, MELEE_ACTIONS } from "../render/melee";
export function pieceDetails(
  piece: Piece,
  version: CombatVersion = "metamorph",
) {
  const u = UNIT[piece.defId],
    scale = 2 ** (piece.star - 1),
    gear = equipmentStats(piece.items),
    tiers =
      version === "fleet" || version === "metamorph"
        ? TRAIT_TIERS
        : AIRSEA_TRAIT_TIERS;
  return {
    name: u.name,
    flying: !!u.flying,
    hp: u.hp * scale + gear.hp,
    attack: u.attack * scale + gear.attack,
    armor: u.armor + gear.armor,
    range: u.range,
    interval: Math.max(1, u.interval * (1 - gear.haste)) * RULES.tickSeconds,
    items: (piece.items ?? []).map((id) => ITEM[id]),
    skillPower: Math.round(gear.skillPower * 100),
    skill: skillName(u.id, version),
    skillDescription: skillDescription(u.id, version),
    sell: salePrice(piece),
    action: isMelee(u.id)
      ? MELEE_ACTIONS[u.id].name
      : isRanged(u.id)
        ? RANGED_ACTIONS[u.id].name
        : "普通攻击",
    traits: u.traits.map((t) => ({
      name: t,
      threshold: tiers[t][0].count,
      description: tiers[t]
        .map((tier) => `${tier.count} 个：${tier.description}`)
        .join("；"),
    })),
  };
}
export function pieceDetailMarkup(
  p: Piece,
  version: CombatVersion = "metamorph",
): string {
  const d = pieceDetails(p, version);
  return `<div class="tooltip-heading"><img src="/assets/units/${p.defId}.png" alt=""><div><strong>${d.name}</strong><span>${"★".repeat(p.star)} · ${p.star} 星</span><small>${d.flying ? "飞行" : "地面"} · ${d.range === 1 ? "近战" : "远程"} · ${d.action}</small></div></div><div class="tooltip-stats"><span>生命<b>${d.hp}</b></span><span>攻击<b>${d.attack}</b></span><span>护甲<b>${d.armor}</b></span><span>射程<b>${d.range} 格</b></span><span>攻击间隔<b>${d.interval.toFixed(2)} 秒</b></span><span>出售价格<b>${d.sell} 金</b></span></div><p class="tooltip-basis">当前星级与装备属性 · 未计入上阵羁绊</p><section><b>${d.skill}</b><p>${d.skillDescription}</p></section>${d.items.length ? `<section><b>已装备 · 技能强度 +${d.skillPower}%</b>${d.items.map((i) => `<p>${i.icon} ${i.name} · ${i.description}</p>`).join("")}</section>` : ""}<section><b>兵种与职业</b>${d.traits.map((t) => `<p><em>${t.name} · ${t.threshold} 个不同棋子</em>${t.description}</p>`).join("")}</section>`;
}
export function pieceInfoMarkup(
  p: Piece,
  version: CombatVersion = "metamorph",
): string {
  return `<div class="modal-backdrop"><section class="modal piece-info-modal" role="dialog" aria-modal="true" aria-label="棋子详情"><button class="close" data-action="close" aria-label="关闭">×</button><span class="eyebrow">UNIT INTELLIGENCE</span><h2>棋子详情</h2>${pieceDetailMarkup(p, version)}</section></div>`;
}
export class BenchTooltip {
  private element = document.createElement("aside");
  private anchor: HTMLElement | null = null;
  private touchInput = false;
  private dismissTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    root: HTMLElement,
    private getPiece: (uid: number) => Piece | undefined,
    private getVersion: () => CombatVersion = () => "metamorph",
  ) {
    this.element.id = "bench-tooltip";
    this.element.className = "bench-tooltip";
    this.element.setAttribute("role", "tooltip");
    this.element.hidden = true;
    document.body.append(this.element);
    const find = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>("[data-bench-info]")
        : null;
    root.addEventListener("pointerdown", (e) => {
      this.touchInput = e.pointerType === "touch";
      if (this.touchInput) this.hide();
    });
    root.addEventListener("pointerover", (e) => {
      if (e.pointerType === "touch") return;
      const a = find(e.target);
      if (a) this.show(a);
    });
    root.addEventListener("pointerout", (e) => {
      const a = find(e.target);
      if (
        a &&
        !a.contains(e.relatedTarget as Node) &&
        !this.element.contains(e.relatedTarget as Node)
      )
        this.dismissSoon();
    });
    root.addEventListener("focusin", (e) => {
      if (this.touchInput) return;
      const a = find(e.target);
      if (a) this.show(a);
    });
    root.addEventListener("focusout", (e) => {
      if (find(e.target) && !find(e.relatedTarget)) this.dismissSoon();
    });
    this.element.addEventListener("pointerenter", () =>
      clearTimeout(this.dismissTimer),
    );
    this.element.addEventListener("pointerleave", () => this.hide());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Tab") this.touchInput = false;
      if (e.key === "Escape") this.hide();
    });
    window.addEventListener("resize", () => this.position());
    window.addEventListener("scroll", () => this.position(), true);
  }
  private dismissSoon() {
    clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => this.hide(), 120);
  }
  hide() {
    clearTimeout(this.dismissTimer);
    this.anchor?.querySelector("button")?.removeAttribute("aria-describedby");
    this.anchor?.removeAttribute("aria-describedby");
    this.anchor = null;
    this.element.hidden = true;
  }
  private show(anchor: HTMLElement) {
    clearTimeout(this.dismissTimer);
    if (this.anchor === anchor && !this.element.hidden) return;
    const p = this.getPiece(Number(anchor.dataset.benchInfo));
    if (!p) return;
    this.hide();
    this.anchor = anchor;
    (anchor.querySelector("button") ?? anchor).setAttribute(
      "aria-describedby",
      this.element.id,
    );
    this.element.innerHTML = pieceDetailMarkup(p, this.getVersion());
    this.element.hidden = false;
    this.position();
  }
  private position() {
    if (!this.anchor || this.element.hidden) return;
    if (!this.anchor.isConnected) {
      this.hide();
      return;
    }
    const r = this.anchor.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) {
      this.hide();
      return;
    }
    // A compact bench can sit near the middle of the screen. Use the room
    // beside it for long descriptions before introducing an internal scroll.
    // Every placement keeps the hovered slot clear so it remains clickable.
    const spaceAbove = Math.max(0, r.top - 22),
      spaceBelow = Math.max(0, innerHeight - r.bottom - 22),
      placeAbove = spaceAbove >= spaceBelow;
    this.element.style.maxHeight = `${Math.max(0, innerHeight - 24)}px`;
    const naturalWidth = this.element.offsetWidth,
      naturalHeight = this.element.offsetHeight,
      fitsRight = r.right + naturalWidth + 22 <= innerWidth,
      fitsLeft = r.left >= naturalWidth + 22;
    if (
      naturalHeight > Math.max(spaceAbove, spaceBelow) &&
      (fitsRight || fitsLeft)
    ) {
      this.element.style.left = `${fitsRight ? r.right + 10 : r.left - naturalWidth - 10}px`;
      this.element.style.top = `${Math.max(12, Math.min(innerHeight - naturalHeight - 12, r.top + r.height / 2 - naturalHeight / 2))}px`;
      return;
    }
    this.element.style.maxHeight = `${placeAbove ? spaceAbove : spaceBelow}px`;
    const w = this.element.offsetWidth,
      h = this.element.offsetHeight;
    this.element.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2))}px`;
    this.element.style.top = `${placeAbove ? r.top - h - 10 : r.bottom + 10}px`;
  }
}
