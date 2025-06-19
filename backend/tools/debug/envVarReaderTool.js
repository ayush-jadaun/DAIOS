import { DynamicTool } from "@langchain/core/tools";

export const envVarReaderTool = new DynamicTool({
  name: "env_var_reader",
  description:
    "Read environment variables. Input is an object or JSON string with optional 'varName' field. Returns either a single variable value or all environment variables as an object.",
  func: async (inputJSON) => {
    let parsedInput = {};
    if (typeof inputJSON === "string") {
      try {
        parsedInput = JSON.parse(inputJSON);
      } catch {}
    } else if (typeof inputJSON === "object" && inputJSON !== null) {
      parsedInput = inputJSON;
    }
    const varName = parsedInput.varName;
    if (varName) {
      const value = process.env[varName];
      return { varName, value: value ?? null, found: value !== undefined };
    } else {
      // Optionally: filter out sensitive keys here
      return process.env;
    }
  },
});
