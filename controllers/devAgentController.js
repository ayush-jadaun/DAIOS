import MessageBus from "../utils/MessageBus.js";
import fs from "fs";

/**
 * Handle a dev agent task request via MessageBus.
 * Expects: { task: string }
 */
export async function handleDevAgentTask(req, res) {
  const { task } = req.body;
  if (!task) return res.status(400).json({ error: "No task provided" });

  const replyChannel = `api.dev.response.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}`;
  let responded = false;
  const bus = new MessageBus("api-dev");

  // Use a named handler reference
  const handler = (msg) => {
    if (!responded) {
      responded = true;
      res.json(msg);
      bus.unsubscribe(replyChannel, handler);
    }
  };

  await bus.subscribe(replyChannel, handler);

  await bus.publish("agent.dev.task", "DEV_TASK", {
    userTask: task,
    replyChannel,
  });

  setTimeout(() => {
    if (!responded) {
      responded = true;
      res.status(504).json({ error: "Dev agent timeout" });
      bus.unsubscribe(replyChannel, handler);
    }
  }, 60000);
}

