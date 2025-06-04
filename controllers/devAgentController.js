import MessageBus from "../utils/MessageBus.js";
import fs from "fs";
import { addToMemory } from "../memory/chromaClient.js";
import { v4 as uuidv4 } from "uuid";

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
  }, 25000);
}

/**
 * Handle file upload for the dev agent: stores file in memory and runs analysis via MessageBus.
 * Expects a multipart/form-data upload at req.file
 */
export async function handleDevAgentFileUpload(req, res) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const fileContent = fs.readFileSync(file.path, "utf8");
    await addToMemory("uploads", uuidv4(), fileContent, {
      filename: file.originalname,
      timestamp: new Date().toISOString(),
    });
    const devTask = `Analyze the following code for improvements, bugs, and suggestions:\n\n${fileContent}`;

    const replyChannel = `api.dev.response.${Date.now()}.${Math.random()
      .toString(36)
      .slice(2)}`;
    let responded = false;
    const bus = new MessageBus("api-dev");

    const handler = (msg) => {
      if (!responded) {
        responded = true;
        res.json(msg);
        bus.unsubscribe(replyChannel, handler);
      }
    };

    await bus.subscribe(replyChannel, handler);

    await bus.publish("agent.dev.task", "DEV_TASK", {
      userTask: devTask,
      replyChannel,
    });

    setTimeout(() => {
      if (!responded) {
        responded = true;
        res.status(504).json({ error: "Dev agent timeout" });
        bus.unsubscribe(replyChannel, handler);
      }
    }, 600000);

    fs.unlinkSync(file.path);
  } catch (err) {
    console.error("Dev Agent File Error:", err);
    res.status(500).json({ error: "Dev agent failed to analyze the file" });
  }
}
