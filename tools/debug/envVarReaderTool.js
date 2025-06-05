import { DynamicTool } from "@langchain/core/tools";

export const envVarReaderTool = new DynamicTool({
  name: "env_var_reader",
  description:
    "Read environment variables. Input is an object or JSON string with optional 'varName' field.",
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
      return process.env[varName] ?? null;
    } else {
      return process.env;
    }
  },
});
