import { DynamicTool } from "@langchain/core/tools";
import { ChatOllama } from "@langchain/ollama";
const llm = new ChatOllama({
  model: "llama3",
  baseUrl: process.env.OLLAMA_URL || "http://ollama:11434",
  temperature: 0,
});

export const stackTraceTool = new DynamicTool({
  name: "stack_trace_explainer",
  description:
    "Explain an error stack trace, including the likely cause and possible fixes. Input is an object or JSON string with 'stack_trace' field.",
  func: async (inputJSON) => {
    try {
      let parsedInput = {};
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch {}
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      }
      const stack = parsedInput.stack_trace;
      if (!stack) return { error: "Missing required field: stack_trace" };
      const prompt = `Explain the following stack trace, including the likely cause of the error and possible ways to fix it:\n\n${stack}`;
      const result = await llm.invoke(prompt);
      return result.content;
    } catch (err) {
      return { error: "LLM failed to explain stack trace: " + err.message };
    }
  },
});
