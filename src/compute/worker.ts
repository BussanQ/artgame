import { compute, type ComputeJob, type ComputeReply } from "./job";
self.onmessage = (event: MessageEvent<ComputeJob>) => {
  let reply: ComputeReply;
  try {
    reply = { ok: true, value: compute(event.data) };
  } catch (error) {
    reply = {
      ok: false,
      message: error instanceof Error ? error.message : "战斗计算失败",
    };
  }
  self.postMessage(reply);
};
