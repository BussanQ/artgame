const focusable =
  'button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href], summary, [tabindex="0"]';
function selector(element: Element | null): string | null {
  if (!element) return null;
  for (const name of [
    "data-action",
    "data-focus",
    "data-jump",
    "data-buy",
    "data-equip",
    "data-equipment-owner",
    "data-unequip",
    "data-craft",
    "data-codex",
    "data-unit-info",
    "data-piece-info",
    "data-cell",
    "data-bench",
    "data-reward",
    "data-setting",
    "data-scout",
    "data-watch-round",
    "data-analyze-round",
    "data-analysis-metric",
    "data-analysis-frame",
  ])
    if (element.hasAttribute(name))
      return `[${name}="${CSS.escape(element.getAttribute(name)!)}"]`;
  return null;
}
/** Keep keyboard focus inside a dialog and restore its launcher after a DOM render. */
export class DialogFocus {
  private open = false;
  private returnTo: string | null = null;
  private active: string | null = null;
  constructor(private root: HTMLElement) {
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const modal = root.querySelector<HTMLElement>('[role="dialog"]');
      if (!modal) return;
      const elements = Array.from(
        modal.querySelectorAll<HTMLElement>(focusable),
      ).filter((e) => e.getClientRects().length > 0);
      const first = elements[0],
        last = elements.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !modal.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !modal.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    });
  }
  beforeRender() {
    this.active = selector(document.activeElement);
    if (!this.open && this.active) this.returnTo = this.active;
  }
  afterRender() {
    const modal = this.root.querySelector<HTMLElement>('[role="dialog"]');
    const shell = this.root.querySelector<HTMLElement>(".shell");
    if (shell) shell.inert = !!modal;
    document.body.classList.toggle("has-modal", !!modal);
    if (modal) {
      const target =
        this.open && this.active
          ? modal.querySelector<HTMLElement>(this.active)
          : null;
      (target ?? modal.querySelector<HTMLElement>(focusable))?.focus({
        preventScroll: true,
      });
    } else if (this.open && this.returnTo) {
      // Shared actions can have a hidden battlefield launcher and a visible intel launcher.
      let target: HTMLElement | null =
        Array.from(this.root.querySelectorAll<HTMLElement>(this.returnTo)).find(
          (element) =>
            element.getClientRects().length > 0 && !element.matches(":disabled"),
        ) ?? null;
      // Mobile menus close while a dialog is open; restore a visible launcher.
      if (!target?.getClientRects().length)
        target = this.root.querySelector<HTMLElement>('[data-action="mobile-tools"]');
      target?.focus({ preventScroll: true });
    }
    if (!modal && !this.open && this.active) {
      let target = this.root.querySelector<HTMLElement>(this.active);
      if (
        this.active.startsWith("[data-buy=") &&
        (!target || target.matches(":disabled"))
      ) {
        target =
          this.root.querySelector<HTMLElement>("[data-buy]:not(:disabled)") ??
          this.root.querySelector<HTMLElement>(
            '[data-action="refresh"]:not(:disabled)',
          ) ??
          this.root.querySelector<HTMLElement>(
            '[data-action="lock"]:not(:disabled)',
          );
      }
      if (
        (!target || target.closest("details:not([open])")) &&
        (this.active === '[data-focus="demo-menu"]' ||
          /^\[data-action="(?:demo|[a-z]+-demo)"\]$/.test(this.active))
      )
        target =
          this.root.querySelector<HTMLElement>('header nav > button[data-action="demo"]') ??
          this.root.querySelector<HTMLElement>('[data-focus="demo-menu"]');
      target?.focus({ preventScroll: true });
    }
    this.open = !!modal;
  }
}
