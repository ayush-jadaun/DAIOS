import { runDevAgent } from "../agents/devAgent.js";
import fs from "fs";
import { addToMemory, queryMemory } from "../memory/chromaClient.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Handle a dev agent task request.
 * Expects: { task: string }
 */
export async function handleDevAgentTask(req, res) {
  const { task } = req.body;
  if (!task) return res.status(400).json({ error: "No task provided" });

  try {
    // Query vector DB for relevant memory using the task
    const memoryResponse = await queryMemory("uploads", task, 3);

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

    const context = docs.map((doc) => `---\n${doc}`).join("\n");
    const context_used = docs.map((doc, i) => ({
      id: ids[i],
      document: doc,
      metadata: metas[i],
    }));

    // Pass the original user task (NOT the enriched context) to runDevAgent,
    // because runDevAgent handles context enrichment itself.
    const response = await runDevAgent(task);
    res.json({ result: response, context_used });
  } catch (err) {
    console.error("Dev Agent Task Error:", err);
    res.status(500).json({ error: "Dev agent task processing failed" });
  }
}

/**
 * Handle file upload for the dev agent: stores file in memory and runs analysis.
 * Expects a multipart/form-data upload at req.file
 */
export async function handleDevAgentFileUpload(req, res) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const fileContent = fs.readFileSync(file.path, "utf8");

    // Store in Chroma memory
    await addToMemory("uploads", uuidv4(), fileContent, {
      filename: file.originalname,
      timestamp: new Date().toISOString(),
    });

    // Prepare prompt for Dev Agent to analyze the code
    const devTask = `Analyze the following code for improvements, bugs, and suggestions:\n\n${fileContent}`;

    // Run dev agent task (uses the file content as the task)
    const response = await runDevAgent(devTask);

    // Delete uploaded file after processing
    fs.unlinkSync(file.path);

    // Respond with dev agent answer
    res.json({ result: response });
  } catch (err) {
    console.error("Dev Agent File Error:", err);
    res.status(500).json({ error: "Dev agent failed to analyze the file" });
  }
}
