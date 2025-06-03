import { runLLMTask } from "../agents/llmAgent.js";
import fs from "fs";
import path from "path";
import { addToMemory, queryMemory } from "../memory/chromaClient.js";
import { v4 as uuidv4 } from "uuid";

export async function handleTaskRequest(req, res) {
  const { task } = req.body;
  if (!task) return res.status(400).json({ error: "No task provided" });

  try {
    // Query vector DB for relevant memory using text directly
    const memoryResponse = await queryMemory("uploads", task, 3);

    // Chroma's bridge response: { documents, ids, metadatas }
    // Each is an array of arrays (one per query)
    const docs =
      Array.isArray(memoryResponse.documents) &&
      Array.isArray(memoryResponse.documents[0])
        ? memoryResponse.documents[0]
        : [];
    const ids =
      Array.isArray(memoryResponse.ids) && Array.isArray(memoryResponse.ids[0])
        ? memoryResponse.ids[0]
        : [];
    const metas =
      Array.isArray(memoryResponse.metadatas) &&
      Array.isArray(memoryResponse.metadatas[0])
        ? memoryResponse.metadatas[0]
        : [];

    // Combine documents into context
    const context = docs.map((doc, i) => `---\n${doc}`).join("\n");

    // For context_used, package as array of objects
    const context_used = docs.map((doc, i) => ({
      id: ids[i],
      document: doc,
      metadata: metas[i],
    }));

    // Final prompt with memory
    const prompt = `You are an intelligent assistant. Use the following context to help answer the task.\n\n${context}\n\nTask: ${task}`;

    // Run the task
    const response = await runLLMTask(prompt);
    res.json({ result: response, context_used });
  } catch (err) {
    console.error("LLM Task Error:", err);
    res.status(500).json({ error: "Task processing failed" });
  }
}

export async function handleFileUpload(req, res) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const fileContent = fs.readFileSync(file.path, "utf8");

    // Store in Chroma memory
    await addToMemory("uploads", uuidv4(), fileContent, {
      filename: file.originalname,
      timestamp: new Date().toISOString(),
    });

    // Prepare prompt for LLM
    const prompt = `Analyze the following code:\n\n${fileContent}`;

    // Run LLM task
    const response = await runLLMTask(prompt);

    // Delete uploaded file after processing
    fs.unlinkSync(file.path);

    // Respond with LLM answer
    res.json({ result: response });
  } catch (err) {
    console.error("File LLM Error:", err);
    res.status(500).json({ error: "LLM failed to analyze the file" });
  }
}
