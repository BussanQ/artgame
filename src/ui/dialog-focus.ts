const focusable =
  'button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]';
function selector(element: Element | null): string | null {
  if (!element) return null;
  for (const name of [
    "data-action",
    "data-unit-info",
    "data-piece-info",
    "data-cell",
    "data-bench",
    "data-reward",
    "data-setting",
    "data-scout",
    "data-watch-round",
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
      this.root
        .querySelector<HTMLElement>(this.returnTo)
        ?.focus({ preventScroll: true });
    }
    if (!modal && !this.open && this.active)
      this.root
        .querySelector<HTMLElement>(this.active)
        ?.focus({ preventScroll: true });
    this.open = !!modal;
  }
}
