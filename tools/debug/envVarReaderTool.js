import { DynamicStructuredTool } from "@langchain/core/tools";

export const envVarReaderTool = new DynamicStructuredTool({
  name: "env_var_reader",
  description:
    "Read environment variables. Input: variable name, or leave blank to return all as JSON.",
  schema: {
    type: "object",
    properties: {
      varName: {
        type: "string",
        description: "Environment variable name (optional).",
      },
    },
    required: [],
  },
  func: async ({ varName }) => {
    if (varName) {
      return process.env[varName] || null;
    } else {
      return process.env;
    }
  },
});
