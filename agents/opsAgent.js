import { createReactAgent, AgentExecutor } from "langchain/agents";
import { ChatOllama } from "@langchain/ollama";
import { opsAgentPrompt } from "../prompts/opsAgentPromt.js";
import { processCheckerTool } from "../tools/ops/processCheckerTool.js";
import { diskSpaceTool } from "../tools/ops/diskSpaceTool.js";
import { dockerTool } from "../tools/ops/dockerTool.js";
import { cpuMemTool } from "../tools/ops/cpuMemTool.js";
import { serviceHealthTool } from "../tools/ops/serviceHealthTool.js";
import { portCheckerTool } from "../tools/ops/portCheckerTool.js";
import { logFetcherTool } from "../tools/ops/logFetcherTool.js";
import axios from "axios";
import MessageBus from "../utils/MessageBus.js";

const bus = new MessageBus("ops");

const llm = new ChatOllama({
  model: "llama3",
  baseUrl: process.env.OLLAMA_URL || "http://ollama:11434",
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
  handleParsingErrors: true,
});

async function classifyTaskLLM(task) {
  const prompt = `
Is the following ops task SIMPLE (can be answered in a single step) or COMPLEX (requires multiple subtasks or a step-by-step plan)? 
Reply with exactly "simple" or "complex" only.

Ops Task: ${task}
`;
  const result = await llm.invoke(prompt);
  const answer = result.content.trim().toLowerCase();
  if (answer.startsWith("complex")) return "complex";
  return "simple";
}

async function callPythonTaskPlanner(task) {
  try {
    const resp = await axios.post("http://task-planner:8002/plan", { task });
    return resp.data;
  } catch (err) {
    console.error(
      "Error calling Python task planner:",
      err?.response?.data || err.message
    );
    throw err;
  }
}

export async function runOpsAgent(userTask, pubSubOptions = {}) {
  try {
    // No memory/context enrichment
    const complexity = await classifyTaskLLM(userTask);
    console.log("Ops task classified as:", complexity);

    let result, mode;
    if (complexity === "complex") {
      console.log(
        "Calling Python LangGraph task planner for complex ops task..."
      );
      result = await callPythonTaskPlanner(userTask);
      mode = "task_manager";
    } else {
      console.log("Using simple ops agent for task...");
      const agentResult = await opsAgentExecutor.invoke({
        input: userTask,
      });
      result = agentResult.output ?? agentResult;
      mode = "simple";
    }

    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.ops",
        "OPS_RESULT",
        {
          userTask,
          mode,
          result,
        }
      );
    }

    return { mode, result };
  } catch (error) {
    console.error("Ops agent execution failed:", error);
    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.ops",
        "OPS_ERROR",
        {
          userTask,
          error: error.message || error,
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
