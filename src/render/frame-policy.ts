/** Absolute playback time comes from the game; throttling only skips drawing work. */
export class FrameGate {
  private last = -Infinity;
  ready(now: number, fps: number, hidden: boolean): boolean {
    if (hidden) return false;
    if (now - this.last + 0.5 < 1000 / fps) return false;
    const interval = 1000 / fps;
    this.last = Number.isFinite(this.last)
      ? this.last +
        Math.max(1, Math.floor((now - this.last + 0.5) / interval)) * interval
      : now;
    return true;
  }
}
