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
import MemoryManager from "../memory/MemoryManager.js";
import { v4 as uuidv4 } from "uuid";

// === AGENT-TO-AGENT COLLABORATION UTILS ===
const KNOWN_AGENTS = ["ops", "dev", "debug"];

function extractAgentRequests(userTask, selfAgent) {
  const requests = [];
  const pattern =
    /(check with|ask|confirm with|consult)\s+(the\s+)?(ceo|cfo|cmo|cto)([^.?!]*)[.?!]/gi;
  let match;
  while ((match = pattern.exec(userTask)) !== null) {
    const verb = match[1].toLowerCase();
    const agent = match[3].toLowerCase();
    if (agent === selfAgent) continue;
    let question = match[4] ? match[4].trim() : "";
    if (!question || question.length < 3)
      question = "Please advise on the technical/debugging matter.";
    requests.push({ agent, verb, question });
  }
  return requests;
}

function waitForAgentReply(bus, replyChannel, agent, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const handler = (msg) => {
      console.log(
        `[AGENT-COMM] [DEBUG] Got reply from ${agent.toUpperCase()} on ${replyChannel}:`,
        msg
      );
      bus.unsubscribe(replyChannel, handler);
      resolve(msg);
    };
    bus.subscribe(replyChannel, handler);
    setTimeout(() => {
      bus.unsubscribe(replyChannel, handler);
      reject(new Error(`Timeout waiting for ${agent.toUpperCase()} reply`));
    }, timeout);
  });
}

// === MEMORY SYSTEM INITIALIZATION ===
const bus = new MessageBus("debug");
let memoryManager = null;

try {
  memoryManager = new MemoryManager("debug");
  await memoryManager.initialize();
  console.log("[DebugAgent] Memory system initialized successfully");
} catch (error) {
  console.warn(
    "[DebugAgent] Memory system failed to initialize, running without memory:",
    error.message
  );
  memoryManager = null;
}

// === LLM AND TOOLS SETUP ===
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
  maxIterations: 10,
  returnIntermediateSteps: true,
  handleParsingErrors: (error) => {
    console.error("Parsing error:", error);
    return "I encountered a formatting error. Let me try again with the correct format.\n\nThought: I need to follow the exact format specified.";
  },
});

// === ENHANCED DEBUG AGENT RUNNER WITH MEMORY ===
export async function runDebugAgent(userTask, pubSubOptions = {}) {
  try {
    console.log("🚀 Starting debug agent with task:", userTask);
    const startTime = Date.now();

    const sessionId = pubSubOptions.sessionId || "default";
    let contextItems = [];
    let enhancedInput = userTask;
    let mode = "simple";

    // --- Agent-to-agent collaboration ---
    const agentRequests = extractAgentRequests(userTask, "debug");
    const interAgentResponses = {};

    for (const req of agentRequests) {
      const { agent, verb, question } = req;
      if (!KNOWN_AGENTS.includes(agent)) continue;

      const replyChannel = `debug.${agent}.collab.reply.${uuidv4()}`;
      const agentRequest = {
        userTask: `Debug Agent requests: ${question}`,
        replyChannel,
        sessionId,
        fromAgent: "debug",
      };

      console.log(
        `[AGENT-COMM] [DEBUG→${agent.toUpperCase()}] Sending:`,
        agentRequest
      );

      bus.publish(`agent.${agent}.request`, agentRequest);

      try {
        const reply = await waitForAgentReply(bus, replyChannel, agent, 30000);
        interAgentResponses[agent] =
          reply.output || reply.data?.output || JSON.stringify(reply);
        console.log(
          `[AGENT-COMM] [${agent.toUpperCase()}→DEBUG] Reply received:`,
          interAgentResponses[agent]
        );
        mode = "agent-collab";
      } catch (err) {
        interAgentResponses[
          agent
        ] = `No reply from ${agent.toUpperCase()} (timeout).`;
        console.warn(
          `[AGENT-COMM] [DEBUG] ${agent.toUpperCase()} did not reply in time!`
        );
      }
    }

    // Add agent replies to the input
    if (Object.keys(interAgentResponses).length > 0) {
      for (const [agent, response] of Object.entries(interAgentResponses)) {
        enhancedInput += `\n\n${agent.toUpperCase()}'s response: ${response}\n`;
      }
    }

    // --- Memory-enhanced context retrieval ---
    if (memoryManager) {
      try {
        contextItems = await memoryManager.getRelevantContext(
          enhancedInput,
          sessionId,
          {
            vectorTopK: 5, // More context for debugging
            sessionLimit: 5, // Recent debugging context
          }
        );

        if (contextItems.length > 0) {
          const contextString =
            memoryManager.formatContextForPrompt(contextItems);

          if (contextString) {
            enhancedInput = `Previous Debugging Context:\n${contextString}\n\nCurrent Debug Task: ${enhancedInput}`;
            if (mode === "simple") mode = "contextual";
            console.log(
              `[DebugAgent] Using context: ${contextItems.length} items`
            );
          }
        }
      } catch (error) {
        console.warn("[DebugAgent] Context retrieval failed:", error.message);
      }
    }

    // --- Execute the debug agent ---
    console.log("🔧 Executing debug agent with enhanced input...");
    const agentResult = await debugAgentExecutor.invoke({
      input: enhancedInput,
    });

    const duration = Date.now() - startTime;
    const result = agentResult.output ?? agentResult;

    console.log(`✅ Debug agent completed in ${duration}ms`);
    console.log("📊 Debug result:", result);

    // --- Store the interaction in memory ---
    if (memoryManager) {
      try {
        await memoryManager.storeInteraction(userTask, result, sessionId);
        console.log("[DebugAgent] Interaction stored in memory");
      } catch (error) {
        console.warn(
          "[DebugAgent] Failed to store interaction:",
          error.message
        );
      }
    }

    // --- Publish results if requested ---
    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.debug",
        "DEBUG_RESULT",
        {
          userTask,
          mode,
          result,
          contextUsed: contextItems.map((item) => ({
            type: item.type,
            timestamp: item.metadata?.timestamp,
          })),
          duration,
          sessionId,
        }
      );
    }

    return {
      mode,
      result,
      duration,
      contextUsed: contextItems.length,
      sessionId,
    };
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
          sessionId: pubSubOptions.sessionId,
        }
      );
    }
    throw error;
  }
}

// === SUBSCRIPTION HANDLERS ===
export function subscribeToDebugTasks(debugAgentRunner = runDebugAgent) {
  // Main orchestrator tasks
  bus.subscribe("agent.debug.task", async (msg) => {
    try {
      console.log("[DebugAgent] Processing orchestrator message:", msg);

      const data = msg.data || msg;
      if (!data || !data.userTask) {
        console.error("[DebugAgent] Invalid message format:", msg);
        return;
      }

      const { userTask, replyChannel, sessionId } = data;
      console.log("[DebugAgent] Received debug task:", userTask);
      console.log("[DebugAgent] Session ID:", sessionId);

      if (!replyChannel) {
        console.error("[DebugAgent] No reply channel provided");
        return;
      }

      const result = await debugAgentRunner(userTask, { sessionId });

      console.log("[DebugAgent] Debug result:", result);
      console.log("[DebugAgent] Publishing result to channel:", replyChannel);

      await bus.publish(replyChannel, "DEBUG_RESULT", {
        output: result.result,
        mode: result.mode,
        contextUsed: result.contextUsed,
        duration: result.duration,
        sessionId,
      });

      console.log("[DebugAgent] Successfully published result!");
    } catch (err) {
      console.error("[DebugAgent] Error in handler:", err);
      if (msg?.data?.replyChannel) {
        try {
          await bus.publish(msg.data.replyChannel, "DEBUG_ERROR", {
            error: err.message || "Unknown error occurred",
            sessionId: msg.data.sessionId,
          });
        } catch (publishErr) {
          console.error("[DebugAgent] Failed to publish error:", publishErr);
        }
      }
    }
  });

  // Agent-to-agent requests (from CEO, CTO, etc.)
  bus.subscribe("agent.debug.request", async (msg) => {
    try {
      console.log("[DebugAgent] Processing agent-to-agent request:", msg);
      const data = msg.data || msg;

      if (!data || !data.userTask || !data.replyChannel) {
        console.error("[DebugAgent] Invalid inter-agent message format:", msg);
        return;
      }

      const { userTask, replyChannel, sessionId, fromAgent } = data;
      console.log(
        `[DebugAgent] Received agent-to-agent request from ${fromAgent}:`,
        userTask
      );

      const result = await runDebugAgent(userTask, { sessionId });

      await bus.publish(replyChannel, "DEBUG_REPLY", {
        output: result.result,
        mode: result.mode,
        contextUsed: result.contextUsed,
        duration: result.duration,
        sessionId,
      });

      console.log(`[DebugAgent] Replied to ${fromAgent} on ${replyChannel}`);
    } catch (err) {
      console.error("[DebugAgent] Error in agent-to-agent handler:", err);
      if (msg?.data?.replyChannel) {
        try {
          await bus.publish(msg.data.replyChannel, "DEBUG_ERROR", {
            error: err.message || "Unknown error occurred",
            sessionId: msg.data.sessionId,
          });
        } catch (publishErr) {
          console.error("[DebugAgent] Failed to publish error:", publishErr);
        }
      }
    }
  });
}

// === MEMORY MANAGEMENT UTILITIES ===
export async function getDebugMemoryStatus() {
  if (!memoryManager) {
    return { status: "disabled", reason: "Memory system not initialized" };
  }

  try {
    return await memoryManager.getMemoryStatus();
  } catch (error) {
    return { status: "error", error: error.message };
  }
}

export async function clearDebugMemory(sessionId = null) {
  if (!memoryManager) {
    console.warn("[DebugAgent] Memory system not available");
    return false;
  }

  try {
    if (sessionId) {
      memoryManager.clearSession(sessionId);
      console.log(`[DebugAgent] Cleared session memory: ${sessionId}`);
    } else {
      await memoryManager.clearAllMemory();
      console.log("[DebugAgent] Cleared all memory");
    }
    return true;
  } catch (error) {
    console.error("[DebugAgent] Failed to clear memory:", error);
    return false;
  }
}

export async function debugMemoryHealthCheck() {
  if (!memoryManager) {
    return { healthy: false, reason: "Memory system not initialized" };
  }

  try {
    const health = await memoryManager.healthCheck();
    return { healthy: health.sessionMemory, details: health };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

// Export the memory manager for direct access if needed
export { memoryManager };
