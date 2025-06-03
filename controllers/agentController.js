import { runLLMTask } from "../agents/llmAgent.js";
import fs from "fs";
import path from "path";

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
export async function handleFileUpload(req, res) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  const fileContent = fs.readFileSync(file.path, "utf8");
  const prompt = `Analyze the following code:\n\n${fileContent}`;

  try {
    const response = await runLLMTask(prompt);
    res.json({ result: response });
  } catch (err) {
    console.error("File LLM Error:", err);
    res.status(500).json({ error: "LLM failed to analyze the file" });
  }
}
