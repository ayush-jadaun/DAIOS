import { createReactAgent, AgentExecutor } from "langchain/agents";
import { ChatOllama } from "@langchain/ollama";
import { serperTool } from "./serperTool.js";
import { PromptTemplate } from "@langchain/core/prompts";

const llm = new ChatOllama({
  model: "llama3",
  baseUrl: process.env.OLLAMA_URL || "http://ollama:11434",
  temperature: 0, 
});

const tools = [serperTool];

const prompt = new PromptTemplate({
  template: `You are a helpful assistant that can search the web for current information. Answer the user's question as best you can using the available tools.

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

Begin!

Question: {input}
Thought:{agent_scratchpad}`,
  inputVariables: ["input", "tools", "tool_names", "agent_scratchpad"],
});

const agent = await createReactAgent({
  llm,
  tools,
  prompt,
});

const agentExecutor = new AgentExecutor({
  agent,
  tools,
  verbose: true, 
  maxIterations: 5, 
  returnIntermediateSteps: true, 
  handleParsingErrors: true, 
});

export async function runLangchainAgent(userTask) {
  try {
    console.log("Starting agent execution for task:", userTask);

    const result = await agentExecutor.invoke({
      input: userTask,
    });

    console.log("Agent execution completed:", result);
    return result.output ?? result;
  } catch (error) {
    console.error("Agent execution failed:", error);


    if (error.message.includes("Agent stopped due to iteration limit")) {
      return "I was able to search for information but reached the maximum number of steps. Please try rephrasing your question or asking for more specific information.";
    }

    throw error;
  }
}
