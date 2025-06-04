import MessageBus from "../utils/MessageBus.js";

/**
 * Handle an ops agent task request via MessageBus.
 * Expects: { opsTask: string }
 */
export async function handleOpsTask(req, res) {
  const { opsTask } = req.body;
  if (!opsTask) return res.status(400).json({ error: "No ops task provided" });

  const replyChannel = `api.ops.response.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}`;
  let responded = false;
  const bus = new MessageBus("api-ops");

  // Use a named handler reference
  const handler = (msg) => {
    if (!responded) {
      responded = true;
      res.json(msg);
      bus.unsubscribe(replyChannel, handler);
    }
  };

  await bus.subscribe(replyChannel, handler);

  await bus.publish("agent.ops.task", "OPS_TASK", {
    userTask: opsTask,
    replyChannel,
  });

  setTimeout(() => {
    if (!responded) {
      responded = true;
      res.status(504).json({ error: "Ops agent timeout" });
      bus.unsubscribe(replyChannel, handler);
    }
  }, 600000);
}
