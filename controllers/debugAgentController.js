import { debugAgentExecutor } from "../agents/debugAgent";

export async function handleDebugTask(req, res) {
  const { errorLog } = req.body;
  if (!errorLog)
    return res.status(400).json({ error: "No error log provided" });

  try {
    const result = await debugAgentExecutor.invoke({
      input: errorLog,
    });
    res.json({ result: result.output ?? result });
  } catch (err) {
    console.error("Debug Agent Error:", err);
    res.status(500).json({ error: "Agent task failed" });
  }
}
