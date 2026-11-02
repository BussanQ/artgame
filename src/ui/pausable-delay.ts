/** A delay that preserves its remaining time while the page is hidden. */
export class PausableDelay {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private remaining = 0;
  private started = 0;
  private callback: (() => void) | null = null;
  private paused = false;
  schedule(callback: () => void, milliseconds: number) {
    this.cancel();
    this.callback = callback;
    this.remaining = milliseconds;
    this.resume();
  }
  cancel() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.callback = null;
    this.remaining = 0;
  }
  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused && this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.remaining = Math.max(
        0,
        this.remaining - (performance.now() - this.started),
      );
    } else if (!paused) this.resume();
  }
  private resume() {
    if (this.paused || !this.callback) return;
    this.started = performance.now();
    this.timer = setTimeout(() => {
      const callback = this.callback;
      this.cancel();
      callback?.();
    }, this.remaining);
  }
}
