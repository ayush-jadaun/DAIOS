import { createReactAgent, AgentExecutor } from "langchain/agents";
import { ChatOllama } from "@langchain/ollama";
import { serperTool } from "./serperTool.js";
import { PromptTemplate } from "@langchain/core/prompts";
import {
  readFileTool,
  writeFileTool,
  listFilesTool,
  appendFileTool,
  deleteFileTool,
  copyFileTool,
  moveFileTool,
} from "./fileToolLangchain.js";

const llm = new ChatOllama({
  model: "llama3",
  baseUrl: process.env.OLLAMA_URL || "http://ollama:11434",
  temperature: 0,
});

const tools = [serperTool, writeFileTool, readFileTool, listFilesTool,appendFileTool,deleteFileTool,copyFileTool,moveFileTool];

// Enhanced debugging
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

// Filter out invalid tools
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

Begin!

Question: {input}
Thought:{agent_scratchpad}`,
  inputVariables: ["input", "tools", "tool_names", "agent_scratchpad"],
});

const agent = await createReactAgent({
  llm,
  tools: validTools,
  prompt,
});

const agentExecutor = new AgentExecutor({
  agent,
  tools: validTools,
  verbose: true,
  maxIterations: 5,
  returnIntermediateSteps: true,
  handleParsingErrors: true,
});

export async function runLangchainAgent(userTask) {
  try {
    console.log("Starting agent execution for task:", userTask);
    console.log(
      "Available tools:",
      validTools.map((t) => t.name)
    );

    const result = await agentExecutor.invoke({
      input: userTask,
    });

    console.log("Agent execution completed:", result);
    return result.output ?? result;
  } catch (error) {
    console.error("Agent execution failed:", error);
    console.error("Error stack:", error.stack);

    if (error.message.includes("Agent stopped due to iteration limit")) {
      return "I was able to search for information but reached the maximum number of steps. Please try rephrasing your question or asking for more specific information.";
    }

    throw error;
  }
}
