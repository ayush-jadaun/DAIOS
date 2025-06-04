import MessageBus from "../utils/MessageBus.js";

export async function handleDebugTask(req, res) {
  const { errorLog } = req.body;
  if (!errorLog)
    return res.status(400).json({ error: "No error log provided" });

  const replyChannel = `api.debug.response.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}`;
  let responded = false;
  const bus = new MessageBus("api-debug");

  // 1. Save a reference to the handler
  const handler = (msg) => {
    if (!responded) {
      responded = true;
      res.json(msg);
      bus.unsubscribe(replyChannel, handler); // Use reference!
    }
  };

  await bus.subscribe(replyChannel, handler);

  await bus.publish("agent.debug.task", "DEBUG_TASK", {
    userTask: errorLog,
    replyChannel,
  });

  setTimeout(() => {
    if (!responded) {
      responded = true;
      res.status(504).json({ error: "Debug agent timeout" });
      bus.unsubscribe(replyChannel, handler); // Use reference!
    }
  }, 600000);
}
