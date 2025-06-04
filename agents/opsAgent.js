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
import { queryMemory } from "../memory/chromaClient.js";

// LLM instance
const llm = new ChatOllama({
  model: "llama3",
  baseUrl: process.env.OLLAMA_URL || "http://ollama:11434",
  temperature: 0,
});

// Tools setup and validation
const tools = [
  processCheckerTool,
  diskSpaceTool,
  logFetcherTool,
  portCheckerTool,
  dockerTool,
  serviceHealthTool,
  cpuMemTool,
];

console.log("OPS AGENT TOOLS DEBUG:");
tools.forEach((tool, index) => {
  console.log(`Tool ${index}:`, {
    tool: tool,
    name: tool?.name,
    description: tool?.description?.substring(0, 50) + "...",
    funcType: typeof tool?.func,
    isValidTool: !!(tool && tool.name && tool.description && tool.func),
  });
});

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

// Prompt definition (using the opsAgentPrompt)
const prompt = opsAgentPrompt;

// Create the agent and executor
const agent = await createReactAgent({
  llm,
  tools: validTools,
  prompt,
});

export const opsAgentExecutor = new AgentExecutor({
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
Is the following ops task SIMPLE (can be answered in a single step) or COMPLEX (requires multiple subtasks or a step-by-step plan)? 
Reply with exactly "simple" or "complex" only.

Ops Task: ${task}
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

export async function runOpsAgent(userTask) {
  try {
    // Always fetch context from Chroma (optionally use an "ops-uploads" collection for ops agent isolation)
    const memoryResponse = await queryMemory("ops-uploads", userTask, 3);

    const docs =
      Array.isArray(memoryResponse.documents) &&
      Array.isArray(memoryResponse.documents[0])
        ? memoryResponse.documents[0]
        : [];
    const context = docs.map((doc) => `---\n${doc}`).join("\n");

    // Combine context and task
    const enrichedTask = `Use the following relevant context to guide your ops/infrastructure response.\n\n${context}\n\nOps Task: ${userTask}`;

    console.log("Classifying ops task complexity for:", userTask);
    const complexity = await classifyTaskLLM(enrichedTask);
    console.log("Ops task classified as:", complexity);

    if (complexity === "complex") {
      // Use the Python LangGraph task planner for complex tasks
      console.log(
        "Calling Python LangGraph task planner for complex ops task..."
      );
      const results = await callPythonTaskPlanner(enrichedTask);
      return { mode: "task_manager", ...results };
    } else {
      // Use the simple agent path
      console.log("Using simple ops agent for task...");
      const result = await opsAgentExecutor.invoke({
        input: enrichedTask,
      });
      return { mode: "simple", result: result.output ?? result };
    }
  } catch (error) {
    console.error("Ops agent execution failed:", error);
    throw error;
  }
}
