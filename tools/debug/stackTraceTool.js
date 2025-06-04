import { DynamicStructuredTool } from "@langchain/core/tools";
import { ChatOllama } from "@langchain/ollama"; // Or your LLM provider

const llm = new ChatOllama({
  model: "llama3",
  baseUrl: process.env.OLLAMA_URL || "http://ollama:11434",
  temperature: 0,
});

export const stackTraceTool = new DynamicStructuredTool({
  name: "stack_trace_explainer",
  description:
    "Explain an error stack trace, including the likely cause and possible fixes. Input: stack trace string.",
  schema: {
    type: "object",
    properties: {
      stack_trace: {
        type: "string",
        description: "The stack trace or error log to explain.",
      },
    },
    required: ["stack_trace"],
  },
  func: async ({ stack_trace }) => {
    try {
      const prompt = `Explain the following stack trace, including the likely cause of the error and possible ways to fix it:\n\n${stack_trace}`;
      const result = await llm.invoke(prompt);
      return result.content;
    } catch (err) {
      return { error: "LLM failed to explain stack trace: " + err.message };
    }
  },
});
