import { debugAgentExecutor } from "../agents/debugAgent.js";
import { queryMemory } from "../memory/chromaClient.js";

/**
 * Handle a debug agent task request.
 * Expects: { errorLog: string }
 */
export async function handleDebugTask(req, res) {
  const { errorLog } = req.body;
  if (!errorLog)
    return res.status(400).json({ error: "No error log provided" });

  try {
    // Query vector DB for relevant memory using the error log
    const memoryResponse = await queryMemory("uploads", errorLog, 3);

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
    const context = docs.map((doc) => `---\n${doc}`).join("\n");

    // For context_used, package as array of objects
    const context_used = docs.map((doc, i) => ({
      id: ids[i],
      document: doc,
      metadata: metas[i],
    }));

    // Enrich the input to the debug agent with context
    const enrichedLog = `Use the following relevant context to guide your debugging.\n\n${context}\n\nError Log: ${errorLog}`;

    // Run the debug agent
    const result = await debugAgentExecutor.invoke({
      input: enrichedLog,
    });

    res.json({ result: result.output ?? result, context_used });
  } catch (err) {
    console.error("Debug Agent Error:", err);
    res.status(500).json({ error: "Agent task failed" });
  }
}
