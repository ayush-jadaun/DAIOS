import {opsAgentExecutor} from "../agents/opsAgent.js"
import { queryMemory } from "../memory/chromaClient.js";

/**
 * Handle an ops agent task request.
 * Expects: { opsTask: string }
 */
export async function handleOpsTask(req, res) {
  const { opsTask } = req.body;
  if (!opsTask) return res.status(400).json({ error: "No ops task provided" });

  try {
    // Query vector DB for relevant memory using the ops task
    const memoryResponse = await queryMemory("ops-uploads", opsTask, 3);

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

    // Enrich the input to the ops agent with context
    const enrichedInput = `Use the following relevant context to guide your ops/infrastructure work.\n\n${context}\n\nOps Task: ${opsTask}`;

    // Run the ops agent
    const result = await opsAgentExecutor.invoke({
      input: enrichedInput,
    });

    res.json({ result: result.output ?? result, context_used });
  } catch (err) {
    console.error("Ops Agent Error:", err);
    res.status(500).json({ error: "Ops agent task failed" });
  }
}
