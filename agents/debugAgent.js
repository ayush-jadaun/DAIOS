import { createReactAgent, AgentExecutor } from "langchain/agents";
import { ChatOllama } from "@langchain/ollama";
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
import { logFileReaderTool } from "../tools/debug/logFileReaderTool.js";
import { dependencyInspectorTool } from "../tools/debug/dependencyInspectorTool.js";
import { envVarReaderTool } from "../tools/debug/envVarReaderTool.js";
import { yamlParserTool } from "../tools/debug/yamlParserTool.js";
import axios from "axios";
import { queryMemory } from "../memory/chromaClient.js";
import MessageBus from "../utils/MessageBus.js";

// Initialize the bus for this agent
const bus = new MessageBus("debug");

// LLM instance
const llm = new ChatOllama({
  model: "llama3",
  baseUrl: process.env.OLLAMA_URL || "http://ollama:11434",
  temperature: 0,
});

// Tools setup and validation
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
  maxIterations: 5,
  returnIntermediateSteps: true,
  handleParsingErrors: true,
});

// LLM-based classifier: decides simple/complex
async function classifyTaskLLM(task) {
  const prompt = `
Is the following debug task SIMPLE (can be answered in a single step) or COMPLEX (requires multiple subtasks or a step-by-step plan)? 
Reply with exactly "simple" or "complex" only.

Debug Task: ${task}
`;
  const result = await llm.invoke(prompt);
  const answer = result.content.trim().toLowerCase();
  if (answer.startsWith("complex")) return "complex";
  return "simple";
}

// Call the Python FastAPI LangGraph Task Planner
async function callPythonTaskPlanner(task) {
  try {
    // Adjust port/URL if your FastAPI service runs elsewhere
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

export async function runDebugAgent(userTask, pubSubOptions = {}) {
  try {
    // Always fetch relevant context from Chroma memory (optional, but helpful)
    const memoryResponse = await queryMemory("uploads", userTask, 3);

    const docs =
      Array.isArray(memoryResponse.documents) &&
      Array.isArray(memoryResponse.documents[0])
        ? memoryResponse.documents[0]
        : [];
    const context = docs.map((doc) => `---\n${doc}`).join("\n");

    // Combine context and task for better debugging
    const enrichedTask = `Use the following relevant context to guide your debugging.\n\n${context}\n\nDebug Task: ${userTask}`;

    // Classify the task complexity
    const complexity = await classifyTaskLLM(enrichedTask);

    let result, mode;
    if (complexity === "complex") {
      // Use the Python LangGraph task planner for complex debug tasks
      console.log(
        "Calling Python LangGraph task planner for complex debug task..."
      );
      result = await callPythonTaskPlanner(enrichedTask);
      mode = "task_manager";
    } else {
      // Use the debug agent directly for simple tasks
      console.log("Using debug agent for simple task...");
      const agentResult = await debugAgentExecutor.invoke({
        input: enrichedTask,
      });
      result = agentResult.output ?? agentResult;
      mode = "simple";
    }

    // Publish the result to the bus if requested
    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.debug",
        "DEBUG_RESULT",
        {
          userTask,
          mode,
          result,
          contextUsed: docs,
        }
      );
    }

    return { mode, result };
  } catch (error) {
    console.error("Debug agent execution failed:", error);
    // Optionally publish error
    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.debug",
        "DEBUG_ERROR",
        {
          userTask,
          error: error.message || error,
        }
      );
    }
    throw error;
  }
}

// Updated subscribeToDebugTasks function - now it has access to runDebugAgent
// In debugAgent.js - modify subscribeToDebugTasks to accept runDebugAgent as parameter
export function subscribeToDebugTasks(debugAgentRunner = runDebugAgent) {
  bus.subscribe("agent.debug.task", async (msg) => {
    try {
      console.log("[DebugAgent] Processing message:", msg);
      
      if (!msg || !msg.data || !msg.data.userTask) {
        console.error("[DebugAgent] Invalid message format:", msg);
        return;
      }

      const { userTask, replyChannel } = msg.data;
      console.log("[DebugAgent] Received debug task:", userTask);
      console.log("[DebugAgent] Reply channel:", replyChannel);

      if (!replyChannel) {
        console.error("[DebugAgent] No reply channel provided");
        return;
      }

      // Use the passed function or default to runDebugAgent
      console.log("[DebugAgent] Running debug agent...");
      const result = await debugAgentRunner(userTask);
      
      console.log("[DebugAgent] Debug result:", result);
      console.log("[DebugAgent] Publishing result to channel:", replyChannel);
      
      // Publish the actual result
      await bus.publish(replyChannel, "DEBUG_RESULT", {
        output: result.result,
        mode: result.mode
      });
      
      console.log("[DebugAgent] Successfully published result!");
      
    } catch (err) {
      console.error("[DebugAgent] Error in handler:", err);
      
      // If there's a reply channel, send error back
      if (msg?.data?.replyChannel) {
        try {
          await bus.publish(msg.data.replyChannel, "DEBUG_ERROR", {
            error: err.message || "Unknown error occurred"
          });
        } catch (publishErr) {
          console.error("[DebugAgent] Failed to publish error:", publishErr);
        }
      }
    }
  });
}


