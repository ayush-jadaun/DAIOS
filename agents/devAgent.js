import { createReactAgent, AgentExecutor } from "langchain/agents";
import { ChatOllama } from "@langchain/ollama";
import { devAgentPrompt } from "../prompts/devAgentPrompt.js";
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
// Dev-specific tools:
import { codeWriterTool } from "../tools/dev/codeWriterTool.js";
import { docsGeneratorTool } from "../tools/dev/docsGeneratorTool.js";
import { testGeneratorTool } from "../tools/dev/testGeneratorTool.js";
import { projectScaffoldTool } from "../tools/dev/projectScaffoldTool.js";
import { prIssueManagerTool } from "../tools/dev/prIssueManagerTool.js";
import { ciConfigTool } from "../tools/dev/ciConfigTool.js";
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
  // Shared + debug tools
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
  // Dev agent specific tools
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
  prompt: devAgentPrompt,
});

export const devAgentExecutor = new AgentExecutor({
  agent,
  tools: validTools,
  verbose: true,
  maxIterations: 7,
  returnIntermediateSteps: true,
  handleParsingErrors: true,
});

// LLM-based classifier: decides simple/complex
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

export async function runDevAgent(userTask) {
  try {
    // Always fetch relevant context from Chroma memory (optional, but helpful)
    const memoryResponse = await queryMemory("uploads", userTask, 3);

    const docs =
      Array.isArray(memoryResponse.documents) &&
      Array.isArray(memoryResponse.documents[0])
        ? memoryResponse.documents[0]
        : [];
    const context = docs.map((doc) => `---\n${doc}`).join("\n");

    // Combine context and task for better results
    const enrichedTask = `Use the following relevant context to guide your development work.\n\n${context}\n\nDev Task: ${userTask}`;

    // Classify the task complexity
    const complexity = await classifyTaskLLM(enrichedTask);

    if (complexity === "complex") {
      // Use the Python LangGraph task planner for complex dev tasks
      console.log(
        "Calling Python LangGraph task planner for complex dev task..."
      );
      const results = await callPythonTaskPlanner(enrichedTask);
      return { mode: "task_manager", ...results };
    } else {
      // Use the dev agent directly for simple tasks
      console.log("Using dev agent for simple task...");
      const result = await devAgentExecutor.invoke({
        input: enrichedTask,
      });
      return { mode: "simple", result: result.output ?? result };
    }
  } catch (error) {
    console.error("Dev agent execution failed:", error);
    throw error;
  }
}
