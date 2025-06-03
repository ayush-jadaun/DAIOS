import { runLLMTask } from "../agents/llmAgent.js";

export async function handleTaskRequest(req, res) {
  const { task } = req.body;
  if (!task) return res.status(400).json({ error: "No task provided" });

  try {
    const response = await runLLMTask(task);
    res.json({ result: response });
  } catch (err) {
    console.error("LLM Error:", err);
    res.status(500).json({ error: "LLM processing failed" });
  }
}
