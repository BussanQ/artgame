import { synthesize, type SoundKind } from "./synthesis";
export interface SoundSettings {
  soundEnabled: boolean;
  soundVolume: number;
}
/** Audio is optional: device/autoplay failures never affect game state. */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private cache = new Map<SoundKind, AudioBuffer>();
  private voices = new Map<AudioBufferSourceNode, () => void>();
  private lastCombatAt = -Infinity;
  private hidden = false;
  private settings: SoundSettings = { soundEnabled: true, soundVolume: 35 };
  private failed = false;
  constructor(private createContext = () => new AudioContext()) {}
  get status(): string {
    if (!this.settings.soundEnabled || this.settings.soundVolume === 0)
      return "音效已静音";
    if (this.failed) return "当前浏览器无法播放音效，游戏仍可正常进行。";
    if (this.context?.state === "running") return "音效已就绪";
    return "点击试听或操作游戏后启用声音";
  }
  configure(settings: SoundSettings) {
    this.settings = { ...settings };
    if (!settings.soundEnabled || settings.soundVolume === 0) this.stop();
    this.applyGain();
  }
  private applyGain() {
    if (!this.master || !this.context) return;
    const gain =
      this.settings.soundEnabled && !this.hidden
        ? (Math.max(0, Math.min(100, this.settings.soundVolume)) / 100) * 0.65
        : 0;
    this.master.gain.setTargetAtTime(gain, this.context.currentTime, 0.015);
  }
  async unlock(): Promise<boolean> {
    if (
      !this.settings.soundEnabled ||
      this.settings.soundVolume === 0 ||
      this.hidden
    )
      return false;
    try {
      if (!this.context) {
        this.context = this.createContext();
        this.master = this.context.createGain();
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -18;
        limiter.knee.value = 12;
        limiter.ratio.value = 6;
        this.master.connect(limiter);
        limiter.connect(this.context.destination);
        this.applyGain();
      }
      if (this.context.state !== "running") await this.context.resume();
      this.failed = false;
      return this.context.state === "running";
    } catch {
      this.failed = true;
      return false;
    }
  }
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    if (hidden) this.stop();
    this.applyGain();
  }
  stop() {
    for (const [voice, release] of this.voices) {
      release();
      try {
        voice.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.voices.clear();
    this.lastCombatAt = -Infinity;
  }
  play(kind: SoundKind, pan = 0, combat = false): boolean {
    const context = this.context;
    if (
      !context ||
      context.state !== "running" ||
      !this.settings.soundEnabled ||
      !this.settings.soundVolume ||
      this.hidden
    )
      return false;
    // At 4x, keep the field readable instead of multiplying sound density.
    if (combat && context.currentTime - this.lastCombatAt < 0.045) return false;
    if (this.voices.size >= 12) return false;
    if (combat) this.lastCombatAt = context.currentTime;
    try {
      let buffer = this.cache.get(kind);
      if (!buffer) {
        const samples = synthesize(kind, context.sampleRate);
        buffer = context.createBuffer(1, samples.length, context.sampleRate);
        buffer.getChannelData(0).set(samples);
        this.cache.set(kind, buffer);
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      const stereo = context.createStereoPanner();
      stereo.pan.value = Math.max(-1, Math.min(1, pan));
      source.connect(stereo);
      stereo.connect(this.master!);
      const release = () => {
        source.disconnect();
        stereo.disconnect();
        this.voices.delete(source);
      };
      source.onended = release;
      this.voices.set(source, release);
      source.start();
      return true;
    } catch {
      this.stop();
      this.failed = true;
      return false;
    }
  }
}
