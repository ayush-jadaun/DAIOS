import { createReactAgent, AgentExecutor } from "langchain/agents";
import { ChatOllama } from "@langchain/ollama";
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
import axios from "axios";
import MessageBus from "../utils/MessageBus.js";

// Initialize the message bus for Dev Agent
const bus = new MessageBus("dev");

const llm = new ChatOllama({
  model: "llama3",
  baseUrl: process.env.OLLAMA_URL || "http://ollama:11434",
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
  maxIterations: 20, // Increased from 7
  returnIntermediateSteps: true,
  handleParsingErrors: true,
});

async function classifyTaskLLM(task) {
  const prompt = `
Is the following dev task SIMPLE (can be answered in a single step) or COMPLEX (requires multiple subtasks or a step-by-step plan)? 
Reply with exactly "simple" or "complex" only.

Dev Task: ${task}
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

export async function runDevAgent(userTask, pubSubOptions = {}) {
  try {
    console.log("Starting dev agent with task:", userTask);

    // Removed: Chroma context fetching

    const enrichedTask = userTask; // No extra context

    const complexity = await classifyTaskLLM(enrichedTask);
    console.log("Task complexity:", complexity);

    let result, mode;
    if (complexity === "complex") {
      console.log("Getting subtasks from Python task planner...");
      const planResult = await callPythonTaskPlanner(enrichedTask);

      // Execute each subtask
      const subtaskResults = [];
      for (const subtask of planResult.subtasks) {
        console.log(`Executing subtask: ${subtask}`);
        const subtaskResult = await devAgentExecutor.invoke({
          input: `Subtask: ${subtask}`,
        });
        subtaskResults.push({
          subtask,
          result: subtaskResult.output,
        });
      }

      result = {
        originalTask: userTask,
        subtasks: planResult.subtasks,
        results: subtaskResults,
      };
      mode = "complex_executed";
    } else {
      console.log("Using dev agent for simple task...");
      const agentResult = await devAgentExecutor.invoke({
        input: enrichedTask,
      });
      result = agentResult.output ?? agentResult;
      mode = "simple";
    }

    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.dev",
        "DEV_RESULT",
        {
          userTask,
          mode,
          result,
          contextUsed: [], // No context used
        }
      );
    }

    return { mode, result };
  } catch (error) {
    console.error("Dev agent execution failed:", error);
    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.dev",
        "DEV_ERROR",
        {
          userTask,
          error: error.message || error,
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
