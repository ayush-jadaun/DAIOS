import MessageBus from "../utils/MessageBus.js";

/**
 * Handle an orchestra agent task request via MessageBus.
 * Expects: { orchestraTask: string }
 */
export async function handleOrchestraTask(req, res) {
  const { orchestraTask } = req.body;
  if (!orchestraTask)
    return res.status(400).json({ error: "No orchestra task provided" });

  const replyChannel = `api.orchestra.response.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}`;
  let responded = false;
  const bus = new MessageBus("api-orchestra");

  const handler = (msg) => {
    if (!responded) {
      responded = true;
      res.json(msg);
      bus.unsubscribe(replyChannel, handler);
    }
  };

  await bus.subscribe(replyChannel, handler);

  await bus.publish("agent.orchestra.task", "ORCHESTRA_TASK", {
    userTask: orchestraTask,
    replyChannel,
  });

  setTimeout(() => {
    if (!responded) {
      responded = true;
      res.status(504).json({ error: "Orchestra agent timeout" });
      bus.unsubscribe(replyChannel, handler);
    }
  }, 600000); // 10 minutes
}
