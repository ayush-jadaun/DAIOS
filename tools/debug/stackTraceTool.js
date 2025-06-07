import { DynamicTool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

// Use Gemini LLM for stack trace explanation
const llm = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
  model: "models/gemini-2.0-flash",
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
      // Gemini's .invoke() returns an object with .content
      return result.content ?? result;
    } catch (err) {
      return { error: "LLM failed to explain stack trace: " + err.message };
    }
  },
});
