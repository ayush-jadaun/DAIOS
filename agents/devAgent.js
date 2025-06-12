import { createReactAgent, AgentExecutor } from "langchain/agents";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { devAgentPrompt } from "../prompts/devAgentPromt.js";
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
import { codeWriterTool } from "../tools/dev/codeWriterTool.js";
import { docsGeneratorTool } from "../tools/dev/docsGeneratorTool.js";
import { testGeneratorTool } from "../tools/dev/testGeneratorTool.js";
import { projectScaffoldTool } from "../tools/dev/projectScaffoldTool.js";
import { prIssueManagerTool } from "../tools/dev/prIssueManagerTool.js";
import { ciConfigTool } from "../tools/dev/ciConfigTool.js";
import { commandExecutorTool } from "../tools/dev/commandExecutor.js";
import MessageBus from "../utils/MessageBus.js";
import MemoryManager from "../memory/MemoryManager.js";
import { v4 as uuidv4 } from "uuid";

// === AGENT-TO-AGENT COLLABORATION UTILS ===
const KNOWN_AGENTS = ["ops", "dev", "debug"];

function extractAgentRequests(userTask, selfAgent) {
  const requests = [];
  const pattern =
    /(check with|ask|confirm with|consult)\s+(the\s+)?(ceo|cfo|cmo|cto|ops|debug)([^.?!]*)[.?!]/gi;
  let match;
  while ((match = pattern.exec(userTask)) !== null) {
    const verb = match[1].toLowerCase();
    const agent = match[3].toLowerCase();
    if (agent === selfAgent) continue;
    let question = match[4] ? match[4].trim() : "";
    if (!question || question.length < 3)
      question = "Please advise on the development/technical matter.";
    requests.push({ agent, verb, question });
  }
  return requests;
}

function waitForAgentReply(bus, replyChannel, agent, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const handler = (msg) => {
      console.log(
        `[AGENT-COMM] [DEV] Got reply from ${agent.toUpperCase()} on ${replyChannel}:`,
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
const bus = new MessageBus("dev");
let memoryManager = null;

try {
  memoryManager = new MemoryManager("dev");
  await memoryManager.initialize();
  console.log("[DevAgent] Memory system initialized successfully");
} catch (error) {
  console.warn(
    "[DevAgent] Memory system failed to initialize, running without memory:",
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
  codeWriterTool,
  docsGeneratorTool,
  testGeneratorTool,
  projectScaffoldTool,
  prIssueManagerTool,
  ciConfigTool,
  commandExecutorTool,
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

// Enhanced error handling
let errorCount = 0;
const MAX_PARSING_ERRORS = 3;

const handleParsingErrors = (error) => {
  console.error("Parsing error:", error);
  errorCount++;
  const errorMessage = error.message || error.toString();

  if (errorCount >= MAX_PARSING_ERRORS) {
    console.error(
      `Hit max parsing errors (${MAX_PARSING_ERRORS}), forcing final answer`
    );
    errorCount = 0;
    return `Final Answer: I encountered repeated tool execution errors. The issue appears to be with tool input formatting or tool availability. Please check:

1. Tool definitions and schemas
2. Input parameter formatting 
3. Tool accessibility and permissions

Error details: ${errorMessage}`;
  }

  if (errorMessage.includes("semantic_code_search")) {
    return `I encountered an error with the semantic code search tool. Let me try using a different approach.

Thought: The semantic_code_search tool is having issues. I should try using the listFiles tool first to see what files are available, then use readFile to examine specific files.`;
  }

  if (errorMessage.includes("formatting") || errorMessage.includes("format")) {
    return `I need to use the correct format. Let me try a different tool or approach.

Thought: There was a formatting issue. I should try using simpler tools or provide a direct answer based on common patterns.`;
  }

  return "I encountered a formatting error. Let me try again with the correct format.\n\nThought: I need to follow the exact format specified.";
};

// Create the agent and executor
const agent = await createReactAgent({
  llm,
  tools: validTools,
  prompt: devAgentPrompt,
});

export const devAgentExecutor = new AgentExecutor({
  agent,
  tools: validTools,
  verbose: true,
  maxIterations: 10,
  returnIntermediateSteps: true,
  maxExecutionTime: 120000,
  earlyStoppingMethod: "force",
  handleParsingErrors,
});

// === ENHANCED DEV AGENT RUNNER WITH MEMORY ===
export async function runDevAgent(userTask, pubSubOptions = {}) {
  try {
    console.log("🚀 Starting dev agent with task:", userTask);
    const startTime = Date.now();

    const sessionId = pubSubOptions.sessionId || "default";
    let contextItems = [];
    let enhancedInput = userTask;
    let mode = "simple";

    // --- Agent-to-agent collaboration ---
    const agentRequests = extractAgentRequests(userTask, "dev");
    const interAgentResponses = {};

    for (const req of agentRequests) {
      const { agent, verb, question } = req;
      if (!KNOWN_AGENTS.includes(agent)) continue;

      const replyChannel = `dev.${agent}.collab.reply.${uuidv4()}`;
      const agentRequest = {
        userTask: `Dev Agent requests: ${question}`,
        replyChannel,
        sessionId,
        fromAgent: "dev",
      };

      console.log(
        `[AGENT-COMM] [DEV→${agent.toUpperCase()}] Sending:`,
        agentRequest
      );

      bus.publish(`agent.${agent}.request`, agentRequest);

      try {
        const reply = await waitForAgentReply(bus, replyChannel, agent, 30000);
        interAgentResponses[agent] =
          reply.output || reply.data?.output || JSON.stringify(reply);
        console.log(
          `[AGENT-COMM] [${agent.toUpperCase()}→DEV] Reply received:`,
          interAgentResponses[agent]
        );
        mode = "agent-collab";
      } catch (err) {
        interAgentResponses[
          agent
        ] = `No reply from ${agent.toUpperCase()} (timeout).`;
        console.warn(
          `[AGENT-COMM] [DEV] ${agent.toUpperCase()} did not reply in time!`
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
            vectorTopK: 5, // Context for development tasks
            sessionLimit: 5, // Recent development context
          }
        );

        if (contextItems.length > 0) {
          const contextString =
            memoryManager.formatContextForPrompt(contextItems);

          if (contextString) {
            enhancedInput = `Previous Development Context:\n${contextString}\n\nCurrent Development Task: ${enhancedInput}`;
            if (mode === "simple") mode = "contextual";
            console.log(
              `[DevAgent] Using context: ${contextItems.length} items`
            );
          }
        }
      } catch (error) {
        console.warn("[DevAgent] Context retrieval failed:", error.message);
      }
    }

    // --- Execute the dev agent ---
    console.log("🔧 Executing dev agent with enhanced input...");
    const agentResult = await devAgentExecutor.invoke({
      input: enhancedInput,
    });

    const duration = Date.now() - startTime;
    const result = agentResult.output ?? agentResult;

    console.log(`✅ Dev agent completed in ${duration}ms`);
    console.log("📊 Dev result:", result);

    // --- Store the interaction in memory ---
    if (memoryManager) {
      try {
        await memoryManager.storeInteraction(userTask, result, sessionId);
        console.log("[DevAgent] Interaction stored in memory");
      } catch (error) {
        console.warn("[DevAgent] Failed to store interaction:", error.message);
      }
    }

    // --- Publish results if requested ---
    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.dev",
        "DEV_RESULT",
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
    console.error("💥 Dev agent execution failed:", error);
    console.error("Stack trace:", error.stack);

    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.dev",
        "DEV_ERROR",
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
export function subscribeToDevTasks(devAgentRunner = runDevAgent) {
  // Main orchestrator tasks
  bus.subscribe("agent.dev.task", async (msg) => {
    try {
      console.log("[DevAgent] Processing orchestrator message:", msg);

      const data = msg.data || msg;
      if (!data || !data.userTask) {
        console.error("[DevAgent] Invalid message format:", msg);
        return;
      }

      const { userTask, replyChannel, sessionId } = data;
      console.log("[DevAgent] Received dev task:", userTask);
      console.log("[DevAgent] Session ID:", sessionId);

      if (!replyChannel) {
        console.error("[DevAgent] No reply channel provided");
        return;
      }

      const result = await devAgentRunner(userTask, { sessionId });

      console.log("[DevAgent] Dev result:", result);
      console.log("[DevAgent] Publishing result to channel:", replyChannel);

      await bus.publish(replyChannel, "DEV_RESULT", {
        output: result.result,
        mode: result.mode,
        contextUsed: result.contextUsed,
        duration: result.duration,
        sessionId,
      });

      console.log("[DevAgent] Successfully published result!");
    } catch (err) {
      console.error("[DevAgent] Error in handler:", err);
      if (msg?.data?.replyChannel) {
        try {
          await bus.publish(msg.data.replyChannel, "DEV_ERROR", {
            error: err.message || "Unknown error occurred",
            sessionId: msg.data.sessionId,
          });
        } catch (publishErr) {
          console.error("[DevAgent] Failed to publish error:", publishErr);
        }
      }
    }
  });

  // Agent-to-agent requests (from CEO, CTO, Debug, Ops, etc.)
  bus.subscribe("agent.dev.request", async (msg) => {
    try {
      console.log("[DevAgent] Processing agent-to-agent request:", msg);
      const data = msg.data || msg;

      if (!data || !data.userTask || !data.replyChannel) {
        console.error("[DevAgent] Invalid inter-agent message format:", msg);
        return;
      }

      const { userTask, replyChannel, sessionId, fromAgent } = data;
      console.log(
        `[DevAgent] Received agent-to-agent request from ${fromAgent}:`,
        userTask
      );

      const result = await runDevAgent(userTask, { sessionId });

      await bus.publish(replyChannel, "DEV_REPLY", {
        output: result.result,
        mode: result.mode,
        contextUsed: result.contextUsed,
        duration: result.duration,
        sessionId,
      });

      console.log(`[DevAgent] Replied to ${fromAgent} on ${replyChannel}`);
    } catch (err) {
      console.error("[DevAgent] Error in agent-to-agent handler:", err);
      if (msg?.data?.replyChannel) {
        try {
          await bus.publish(msg.data.replyChannel, "DEV_ERROR", {
            error: err.message || "Unknown error occurred",
            sessionId: msg.data.sessionId,
          });
        } catch (publishErr) {
          console.error("[DevAgent] Failed to publish error:", publishErr);
        }
      }
    }
  });
}

// === MEMORY MANAGEMENT UTILITIES ===
export async function getDevMemoryStatus() {
  if (!memoryManager) {
    return { status: "disabled", reason: "Memory system not initialized" };
  }

  try {
    return await memoryManager.getMemoryStatus();
  } catch (error) {
    return { status: "error", error: error.message };
  }
}

export async function clearDevMemory(sessionId = null) {
  if (!memoryManager) {
    console.warn("[DevAgent] Memory system not available");
    return false;
  }

  try {
    if (sessionId) {
      memoryManager.clearSession(sessionId);
      console.log(`[DevAgent] Cleared session memory: ${sessionId}`);
    } else {
      await memoryManager.clearAllMemory();
      console.log("[DevAgent] Cleared all memory");
    }
    return true;
  } catch (error) {
    console.error("[DevAgent] Failed to clear memory:", error);
    return false;
  }
}

export async function devMemoryHealthCheck() {
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
