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
import MemoryManager from "../memory/MemoryManager.js";
import { v4 as uuidv4 } from "uuid";

// === AGENT-TO-AGENT COLLABORATION UTILS ===
const KNOWN_AGENTS = ["ops", "dev", "debug"];

function extractAgentRequests(userTask, selfAgent) {
  const requests = [];
  const pattern =
    /(check with|ask|confirm with|consult)\s+(the\s+)?(ceo|cfo|cmo|cto|dev|debug)([^.?!]*)[.?!]/gi;
  let match;
  while ((match = pattern.exec(userTask)) !== null) {
    const verb = match[1].toLowerCase();
    const agent = match[3].toLowerCase();
    if (agent === selfAgent) continue;
    let question = match[4] ? match[4].trim() : "";
    if (!question || question.length < 3)
      question = "Please advise on the operations/infrastructure matter.";
    requests.push({ agent, verb, question });
  }
  return requests;
}

function waitForAgentReply(bus, replyChannel, agent, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const handler = (msg) => {
      console.log(
        `[AGENT-COMM] [OPS] Got reply from ${agent.toUpperCase()} on ${replyChannel}:`,
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
const bus = new MessageBus("ops");
let memoryManager = null;

try {
  memoryManager = new MemoryManager("ops");
  await memoryManager.initialize();
  console.log("[OpsAgent] Memory system initialized successfully");
} catch (error) {
  console.warn(
    "[OpsAgent] Memory system failed to initialize, running without memory:",
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

// === ENHANCED OPS AGENT RUNNER WITH MEMORY ===
export async function runOpsAgent(userTask, pubSubOptions = {}) {
  try {
    console.log("🚀 Starting ops agent with task:", userTask);
    const startTime = Date.now();

    const sessionId = pubSubOptions.sessionId || "default";
    let contextItems = [];
    let enhancedInput = userTask;
    let mode = "simple";

    // --- Agent-to-agent collaboration ---
    const agentRequests = extractAgentRequests(userTask, "ops");
    const interAgentResponses = {};

    for (const req of agentRequests) {
      const { agent, question } = req;
      if (!KNOWN_AGENTS.includes(agent)) continue;

      const replyChannel = `ops.${agent}.collab.reply.${uuidv4()}`;
      const agentRequest = {
        userTask: `Ops Agent requests: ${question}`,
        replyChannel,
        sessionId,
        fromAgent: "ops",
      };

      console.log(
        `[AGENT-COMM] [OPS→${agent.toUpperCase()}] Sending:`,
        agentRequest
      );

      bus.publish(`agent.${agent}.request`, agentRequest);

      try {
        const reply = await waitForAgentReply(bus, replyChannel, agent, 30000);
        interAgentResponses[agent] =
          reply.output || reply.data?.output || JSON.stringify(reply);
        console.log(
          `[AGENT-COMM] [${agent.toUpperCase()}→OPS] Reply received:`,
          interAgentResponses[agent]
        );
        mode = "agent-collab";
      } catch (err) {
        interAgentResponses[
          agent
        ] = `No reply from ${agent.toUpperCase()} (timeout).`;
        console.warn(
          `[AGENT-COMM] [OPS] ${agent.toUpperCase()} did not reply in time!`
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
            vectorTopK: 5, // Context for operations tasks
            sessionLimit: 5, // Recent operations context
          }
        );

        if (contextItems.length > 0) {
          const contextString =
            memoryManager.formatContextForPrompt(contextItems);

          if (contextString) {
            enhancedInput = `Previous Operations Context:\n${contextString}\n\nCurrent Operations Task: ${enhancedInput}`;
            if (mode === "simple") mode = "contextual";
            console.log(
              `[OpsAgent] Using context: ${contextItems.length} items`
            );
          }
        }
      } catch (error) {
        console.warn("[OpsAgent] Context retrieval failed:", error.message);
      }
    }

    // --- Execute the ops agent ---
    console.log("🔧 Executing ops agent with enhanced input...");
    const agentResult = await opsAgentExecutor.invoke({
      input: enhancedInput,
    });

    const duration = Date.now() - startTime;
    const result = agentResult.output ?? agentResult;

    console.log(`✅ Ops agent completed in ${duration}ms`);
    console.log("📊 Ops result:", result);

    // --- Store the interaction in memory ---
    if (memoryManager) {
      try {
        await memoryManager.storeInteraction(userTask, result, sessionId);
        console.log("[OpsAgent] Interaction stored in memory");
      } catch (error) {
        console.warn(
          "[OpsAgent] Failed to store interaction:",
          error.message
        );
      }
    }

    // --- Publish results if requested ---
    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.ops",
        "OPS_RESULT",
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
          sessionId: pubSubOptions.sessionId,
        }
      );
    }
    throw error;
  }
}

// === SUBSCRIPTION HANDLERS ===
export function subscribeToOpsTasks(opsAgentRunner = runOpsAgent) {
  // Main orchestrator tasks
  bus.subscribe("agent.ops.task", async (msg) => {
    try {
      console.log("[OpsAgent] Processing orchestrator message:", msg);

      const data = msg.data || msg;
      if (!data || !data.userTask) {
        console.error("[OpsAgent] Invalid message format:", msg);
        return;
      }

      const { userTask, replyChannel, sessionId } = data;
      console.log("[OpsAgent] Received ops task:", userTask);
      console.log("[OpsAgent] Session ID:", sessionId);

      if (!replyChannel) {
        console.error("[OpsAgent] No reply channel provided");
        return;
      }

      const result = await opsAgentRunner(userTask, { sessionId });

      console.log("[OpsAgent] Ops result:", result);
      console.log("[OpsAgent] Publishing result to channel:", replyChannel);

      await bus.publish(replyChannel, "OPS_RESULT", {
        output: result.result,
        mode: result.mode,
        contextUsed: result.contextUsed,
        duration: result.duration,
        sessionId,
      });

      console.log("[OpsAgent] Successfully published result!");
    } catch (err) {
      console.error("[OpsAgent] Error in handler:", err);
      if (msg?.data?.replyChannel) {
        try {
          await bus.publish(msg.data.replyChannel, "OPS_ERROR", {
            error: err.message || "Unknown error occurred",
            sessionId: msg.data.sessionId,
          });
        } catch (publishErr) {
          console.error("[OpsAgent] Failed to publish error:", publishErr);
        }
      }
    }
  })
  bus.subscribe("agent.ops.request", async (msg) => {
    try {
      console.log("[OpsAgent] Processing agent-to-agent request:", msg);
      const data = msg.data || msg;

      if (!data || !data.userTask || !data.replyChannel) {
        console.error("[OpsAgent] Invalid inter-agent message format:", msg);
        return;
      }

      const { userTask, replyChannel, sessionId, fromAgent } = data;
      console.log(
        `[OpsAgent] Received agent-to-agent request from ${fromAgent}:`,
        userTask
      );

      const result = await runOpsAgent(userTask, { sessionId });

      await bus.publish(replyChannel, "OPS_REPLY", {
        output: result.result,
        mode: result.mode,
        contextUsed: result.contextUsed,
        duration: result.duration,
        sessionId,
      });

      console.log(`[OpsAgent] Replied to ${fromAgent} on ${replyChannel}`);
    } catch (err) {
      console.error("[OpsAgent] Error in agent-to-agent handler:", err);
      if (msg?.data?.replyChannel) {
        try {
          await bus.publish(msg.data.replyChannel, "OPS_ERROR", {
            error: err.message || "Unknown error occurred",
            sessionId: msg.data.sessionId,
          });
        } catch (publishErr) {
          console.error("[OpsAgent] Failed to publish error:", publishErr);
        }
      }
    }
  });
}





// === MEMORY MANAGEMENT UTILITIES ===
export async function getOpsMemoryStatus() {
  if (!memoryManager) {
    return { status: "disabled", reason: "Memory system not initialized" };
  }

  try {
    return await memoryManager.getMemoryStatus();
  } catch (error) {
    return { status: "error", error: error.message };
  }
}

export async function clearOpsMemory(sessionId = null) {
  if (!memoryManager) {
    console.warn("[OpsAgent] Memory system not available");
    return false;
  }

  try {
    if (sessionId) {
      await memoryManager.clearSession(sessionId);
      console.log(`[OpsAgent] Cleared session memory: ${sessionId}`);
    } else {
      await memoryManager.clearAllMemory();
      console.log("[OpsAgent] Cleared all memory");
    }
    return true;
  } catch (error) {
    console.error("[OpsAgent] Failed to clear memory:", error);
    return false;
  }
}

export async function opsMemoryHealthCheck() {
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
