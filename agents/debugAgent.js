import { createReactAgent, AgentExecutor } from "langchain/agents";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { debugAgentPrompt } from "../prompts/debugAgentPrompt.js";
import { serperTool } from "../tools/webSearch/serperTool.js";
import {
  readFileTool,
  writeFileTool,
  listFilesTool,
  appendFileTool,
  deleteFileTool,
  moveFileTool,
  copyFileTool,
} from "../tools/filetools/fileToolLangchain.js";
import { jsonParserTool } from "../tools/jsonParser/jsonParser.js";
import { semanticCodeSearchTool } from "../tools/debug/sementicCodeSearchTool.js";
import { linterTool } from "../tools/debug/linterTool.js";
import { stackTraceTool } from "../tools/debug/stackTraceTool.js";
import { testRunnerTool } from "../tools/debug/testRunnerTool.js";
import { yamlParserTool } from "../tools/debug/yamlParserTool.js";
import { logFileReaderTool } from "../tools/debug/logFileReaderTool.js";
import { dependencyInspectorTool } from "../tools/debug/dependencyInspectorTool.js";
import { envVarReaderTool } from "../tools/debug/envVarReaderTool.js";
import MessageBus from "../utils/MessageBus.js";

// Initialize the message bus for Debug Agent
const bus = new MessageBus("debug");

// Use Gemini instead of Ollama
const llm = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
  model: "models/gemini-2.0-flash",
  temperature: 0,
});

const tools = [
  serperTool,
  readFileTool,
  writeFileTool,
  listFilesTool,
  appendFileTool,
  deleteFileTool,
  moveFileTool,
  copyFileTool,
  jsonParserTool,
  semanticCodeSearchTool,
  linterTool,
  stackTraceTool,
  testRunnerTool,
  yamlParserTool,
  logFileReaderTool,
  dependencyInspectorTool,
  envVarReaderTool,
];

const validTools = tools.filter((tool) => {
  const isValid =
    tool &&
    typeof tool.name === "string" &&
    typeof tool.description === "string" &&
    typeof tool.func === "function";

  if (!isValid) {
    console.error("INVALID TOOL DETECTED:", tool);
    console.error("Tool structure:", {
      name: tool?.name,
      description: tool?.description,
      func: typeof tool?.func,
    });
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

// Create the agent and executor
const agent = await createReactAgent({
  llm,
  tools: validTools,
  prompt: debugAgentPrompt,
});

export const debugAgentExecutor = new AgentExecutor({
  agent,
  tools: validTools,
  verbose: true,
  maxIterations: 10, // Reduced to prevent infinite loops
  returnIntermediateSteps: true,
  handleParsingErrors: (error) => {
    console.error("Parsing error:", error);
    return "I encountered a formatting error. Let me try again with the correct format.\n\nThought: I need to follow the exact format specified.";
  },
});

export async function runDebugAgent(userTask, pubSubOptions = {}) {
  try {
    console.log("🚀 Starting debug agent with task:", userTask);

    const startTime = Date.now();
    const agentResult = await debugAgentExecutor.invoke({
      input: userTask,
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Agent completed in ${duration}ms`);
    console.log("📊 Agent result:", agentResult);

    const result = agentResult.output ?? agentResult;
    const mode = "simple";

    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.debug",
        "DEBUG_RESULT",
        {
          userTask,
          mode,
          result,
          contextUsed: [],
          duration,
        }
      );
    }

    return { mode, result, duration };
  } catch (error) {
    console.error("💥 Debug agent execution failed:", error);
    console.error("Stack trace:", error.stack);

    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.debug",
        "DEBUG_ERROR",
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

// Listen for debug tasks via pubsub and auto-process
export function subscribeToDebugTasks(debugAgentRunner = runDebugAgent) {
  bus.subscribe("agent.debug.task", async (msg) => {
    try {
      console.log("[DebugAgent] Processing message:", msg);

      const data = msg.data || msg;
      if (!data || !data.userTask) {
        console.error("[DebugAgent] Invalid message format:", msg);
        return;
      }

      const { userTask, replyChannel } = data;
      console.log("[DebugAgent] Received debug task:", userTask);
      console.log("[DebugAgent] Reply channel:", replyChannel);

      if (!replyChannel) {
        console.error("[DebugAgent] No reply channel provided");
        return;
      }

      // Use passed runner (for testing/mocking)
      console.log("[DebugAgent] Running debug agent...");
      const result = await debugAgentRunner(userTask);

      console.log("[DebugAgent] Debug result:", result);
      console.log("[DebugAgent] Publishing result to channel:", replyChannel);

      await bus.publish(replyChannel, "DEBUG_RESULT", {
        output: result.result,
        mode: result.mode,
      });

      console.log("[DebugAgent] Successfully published result!");
    } catch (err) {
      console.error("[DebugAgent] Error in handler:", err);
      if (msg?.data?.replyChannel) {
        try {
          await bus.publish(msg.data.replyChannel, "DEBUG_ERROR", {
            error: err.message || "Unknown error occurred",
          });
        } catch (publishErr) {
          console.error("[DebugAgent] Failed to publish error:", publishErr);
        }
      }
    }
  });
}
