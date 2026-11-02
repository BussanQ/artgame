import type { ComputeJob, ComputeReply, ComputeResult } from "./job";
export class ComputationCancelled extends Error {
  constructor() {
    super("战斗计算已取消");
  }
}
export interface WorkerPort {
  onmessage: ((event: MessageEvent<ComputeReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(job: ComputeJob): void;
  terminate(): void;
}
export class BattleComputer {
  private pending: {
    worker: WorkerPort;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  } | null = null;
  constructor(
    private factory: () => WorkerPort = () =>
      new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
  ) {}
  cancel() {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timeout);
    pending.worker.terminate();
    pending.reject(new ComputationCancelled());
  }
  run(job: ComputeJob): Promise<ComputeResult> {
    this.cancel();
    return new Promise((resolve, reject) => {
      let worker: WorkerPort;
      try {
        worker = this.factory();
      } catch {
        reject(new Error("无法启动战斗计算，请重试或刷新页面。"));
        return;
      }
      const finish = (value?: ComputeResult, error?: Error) => {
        if (this.pending?.worker !== worker) return;
        clearTimeout(this.pending.timeout);
        this.pending = null;
        worker.terminate();
        if (error) reject(error);
        else resolve(value!);
      };
      const timeout = setTimeout(
        () =>
          finish(
            undefined,
            new Error("计算耗时过长，当前进度未改变，请重试。"),
          ),
        30000,
      );
      this.pending = { worker, reject, timeout };
      worker.onmessage = (event) => {
        const reply = event.data;
        if (reply.ok) finish(reply.value);
        else finish(undefined, new Error(reply.message));
      };
      worker.onerror = () =>
        finish(undefined, new Error("计算未完成，当前进度未改变，请重试。"));
      worker.onmessageerror = () =>
        finish(undefined, new Error("无法读取战斗结果，请重试。"));
      try {
        worker.postMessage(job);
      } catch {
        finish(undefined, new Error("无法提交战斗计算，请重试。"));
      }
    });
  }
}
