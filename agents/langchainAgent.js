import { createReactAgent, AgentExecutor } from "langchain/agents";
import { ChatOllama } from "@langchain/ollama";
import { serperTool } from "../tools/webSearch/serperTool.js";
import { PromptTemplate } from "@langchain/core/prompts";
import {
  readFileTool,
  writeFileTool,
  listFilesTool,
  appendFileTool,
  deleteFileTool,
  copyFileTool,
  moveFileTool,
} from "../tools/filetools/fileToolLangchain.js";
import axios from "axios"; 
import { queryMemory,addToMemory } from "../memory/chromaClient.js";

// LLM instance
const llm = new ChatOllama({
  model: "llama3",
  baseUrl: process.env.OLLAMA_URL || "http://ollama:11434",
  temperature: 0,
});

// Tools setup and validation
const tools = [
  serperTool,
  writeFileTool,
  readFileTool,
  listFilesTool,
  appendFileTool,
  deleteFileTool,
  copyFileTool,
  moveFileTool,
];

console.log("LANGCHAIN TOOLS DEBUG:");
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

// Prompt definition
const prompt = new PromptTemplate({
  template: `You are a helpful assistant that can search the web and work with files. Answer the user's question as best you can using the available tools.

You have access to the following tools:
{tools}

Use the following format EXACTLY:

Question: the input question you must answer
Thought: you should always think about what to do
Action: the action to take, should be one of [{tool_names}]
Action Input: the input to the action (must be valid JSON)
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input question

IMPORTANT: 
- Only use each tool once per question unless you need different information
- After getting search results, analyze them and provide a final answer
- Do not repeat the same search multiple times
- Always provide JSON input to tools in the correct format
**- If you already know the answer, do not use any tools, just provide the Final Answer immediately.**

Begin!

Question: {input}
Thought:{agent_scratchpad}`,
  inputVariables: ["input", "tools", "tool_names", "agent_scratchpad"],
});

// Create the agent and executor
const agent = await createReactAgent({
  llm,
  tools: validTools,
  prompt,
});

const agentExecutor = new AgentExecutor({
  agent,
  tools: validTools,
  verbose: true,
  maxIterations: 3,
  returnIntermediateSteps: true,
  handleParsingErrors: true,
});

// LLM-based classifier: decides simple/complex
async function classifyTaskLLM(task) {
  const prompt = `
Is the following user task SIMPLE (can be answered in a single step) or COMPLEX (requires multiple subtasks or a step-by-step plan)? 
Reply with exactly "simple" or "complex" only.

Task: ${task}
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

export async function runLangchainAgent(userTask) {
  try {
    // Always fetch context from Chroma
    const memoryResponse = await queryMemory("uploads", userTask, 3);

    const docs =
      Array.isArray(memoryResponse.documents) &&
      Array.isArray(memoryResponse.documents[0])
        ? memoryResponse.documents[0]
        : [];
    const context = docs.map((doc) => `---\n${doc}`).join("\n");

    // Combine context and task
    const enrichedTask = `Use the following relevant context to guide your response.\n\n${context}\n\nTask: ${userTask}`;

    console.log("Classifying task complexity for:", userTask);
    const complexity = await classifyTaskLLM(enrichedTask);
    console.log("Task classified as:", complexity);

    if (complexity === "complex") {
      // Use the Python LangGraph task planner for complex tasks
      console.log("Calling Python LangGraph task planner for complex task...");
      const results = await callPythonTaskPlanner(enrichedTask);
      return { mode: "task_manager", ...results };
    } else {
      // Use the simple agent path
      console.log("Using simple agent for task...");
      const result = await agentExecutor.invoke({
        input: enrichedTask,
      });
      return { mode: "simple", result: result.output ?? result };
    }
  } catch (error) {
    console.error("Agent execution failed:", error);
    throw error;
  }
}