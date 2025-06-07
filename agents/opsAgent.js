import { createReactAgent, AgentExecutor } from "langchain/agents";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { opsAgentPrompt } from "../prompts/opsAgentPromt.js";
import { processCheckerTool } from "../tools/ops/processCheckerTool.js";
import { diskSpaceTool } from "../tools/ops/diskSpaceTool.js";
import { dockerTool } from "../tools/ops/dockerTool.js";
import { cpuMemTool } from "../tools/ops/cpuMemTool.js";
import { serviceHealthTool } from "../tools/ops/serviceHealthTool.js";
import { portCheckerTool } from "../tools/ops/portCheckerTool.js";
import { logFetcherTool } from "../tools/ops/logFetcherTool.js";
import MessageBus from "../utils/MessageBus.js";

const bus = new MessageBus("ops");

// Use Gemini instead of Ollama
const llm = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
  model: "models/gemini-2.0-flash",
  temperature: 0,
});

const tools = [
  processCheckerTool,
  diskSpaceTool,
  logFetcherTool,
  portCheckerTool,
  dockerTool,
  serviceHealthTool,
  cpuMemTool,
];

const validTools = tools.filter((tool) => {
  const isValid =
    tool &&
    typeof tool.name === "string" &&
    typeof tool.description === "string" &&
    typeof tool.func === "function";

  if (!isValid) {
    console.error("INVALID TOOL DETECTED:", tool);
  }
  return isValid;
});

console.log(
  `Using ${validTools.length} valid tools out of ${tools.length} total tools`
);
console.log(
  "Valid tool names:",
  validTools.map((t) => t.name)
);

if (validTools.length === 0) {
  throw new Error("No valid tools available! Check your tool definitions.");
}

const agent = await createReactAgent({
  llm,
  tools: validTools,
  prompt: opsAgentPrompt,
});

export const opsAgentExecutor = new AgentExecutor({
  agent,
  tools: validTools,
  verbose: true,
  maxIterations: 15,
  returnIntermediateSteps: true,
  handleParsingErrors: (error) => {
    console.error("Parsing error:", error);
    return "I encountered a formatting error. Let me try again with the correct format.\n\nThought: I need to follow the exact format specified.";
  },
});

export async function runOpsAgent(userTask, pubSubOptions = {}) {
  try {
    console.log("🚀 Starting ops agent with task:", userTask);

    const startTime = Date.now();

    // Always use simple ops agent for all tasks
    console.log("Using simple ops agent for task...");
    const agentResult = await opsAgentExecutor.invoke({
      input: userTask,
    });
    const result = agentResult.output ?? agentResult;
    const mode = "simple";

    const duration = Date.now() - startTime;
    console.log(`✅ Ops agent completed in ${duration}ms`);
    console.log("📊 Ops result:", result);

    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.ops",
        "OPS_RESULT",
        {
          userTask,
          mode,
          result,
          duration,
        }
      );
    }

    return { mode, result, duration };
  } catch (error) {
    console.error("💥 Ops agent execution failed:", error);
    console.error("Stack trace:", error.stack);

    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.ops",
        "OPS_ERROR",
        {
          userTask,
          error: error.message || error,
          stack: error.stack,
        }
      );
    }
    throw error;
  }
}

// Listen for ops tasks via pubsub and auto-process
export function subscribeToOpsTasks(opsAgentRunner = runOpsAgent) {
  bus.subscribe("agent.ops.task", async (msg) => {
    try {
      console.log("[OpsAgent] Processing message:", msg);

      // Defensive: accept both old and new formats during transition
      const data = msg.data || msg;
      if (!data || !data.userTask) {
        console.error("[OpsAgent] Invalid message format:", msg);
        return;
      }

      const { userTask, replyChannel } = data;
      console.log("[OpsAgent] Received ops task:", userTask);
      console.log("[OpsAgent] Reply channel:", replyChannel);

      if (!replyChannel) {
        console.error("[OpsAgent] No reply channel provided");
        return;
      }

      // Use passed runner (for testing/mocking)
      console.log("[OpsAgent] Running ops agent...");
      const result = await opsAgentRunner(userTask);

      console.log("[OpsAgent] Ops result:", result);
      console.log("[OpsAgent] Publishing result to channel:", replyChannel);

      await bus.publish(replyChannel, "OPS_RESULT", {
        output: result.result,
        mode: result.mode,
      });

      console.log("[OpsAgent] Successfully published result!");
    } catch (err) {
      console.error("[OpsAgent] Error in handler:", err);
      if (msg?.data?.replyChannel) {
        try {
          await bus.publish(msg.data.replyChannel, "OPS_ERROR", {
            error: err.message || "Unknown error occurred",
          });
        } catch (publishErr) {
          console.error("[OpsAgent] Failed to publish error:", publishErr);
        }
      }
    }
  });
}
