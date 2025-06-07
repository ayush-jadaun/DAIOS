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
import MessageBus from "../utils/MessageBus.js";

// Initialize the message bus for Dev Agent
const bus = new MessageBus("dev");

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
  codeWriterTool,
  docsGeneratorTool,
  testGeneratorTool,
  projectScaffoldTool,
  prIssueManagerTool,
  ciConfigTool,
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

// Wrap all your tools

const agent = await createReactAgent({
  llm,
  tools: validTools,
  prompt: devAgentPrompt,
});

export const devAgentExecutor = new AgentExecutor({
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

export async function runDevAgent(userTask, pubSubOptions = {}) {
  try {
    console.log("🚀 Starting dev agent with task:", userTask);

    const startTime = Date.now();
    const agentResult = await devAgentExecutor.invoke({
      input: userTask,
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Agent completed in ${duration}ms`);
    console.log("📊 Agent result:", agentResult);

    const result = agentResult.output ?? agentResult;
    const mode = "simple";

    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.dev",
        "DEV_RESULT",
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
        }
      );
    }
    throw error;
  }
}

// Listen for dev tasks via pubsub and auto-process
export function subscribeToDevTasks(devAgentRunner = runDevAgent) {
  bus.subscribe("agent.dev.task", async (msg) => {
    try {
      console.log("[DevAgent] Processing message:", msg);

      // Defensive: accept both old and new formats during transition
      const data = msg.data || msg;
      if (!data || !data.userTask) {
        console.error("[DevAgent] Invalid message format:", msg);
        return;
      }

      const { userTask, replyChannel } = data;
      console.log("[DevAgent] Received dev task:", userTask);
      console.log("[DevAgent] Reply channel:", replyChannel);

      if (!replyChannel) {
        console.error("[DevAgent] No reply channel provided");
        return;
      }

      // Use passed runner (for testing/mocking)
      console.log("[DevAgent] Running dev agent...");
      const result = await devAgentRunner(userTask);

      console.log("[DevAgent] Dev result:", result);
      console.log("[DevAgent] Publishing result to channel:", replyChannel);

      await bus.publish(replyChannel, "DEV_RESULT", {
        output: result.result,
        mode: result.mode,
      });

      console.log("[DevAgent] Successfully published result!");
    } catch (err) {
      console.error("[DevAgent] Error in handler:", err);
      if (msg?.data?.replyChannel) {
        try {
          await bus.publish(msg.data.replyChannel, "DEV_ERROR", {
            error: err.message || "Unknown error occurred",
          });
        } catch (publishErr) {
          console.error("[DevAgent] Failed to publish error:", publishErr);
        }
      }
    }
  });
}
