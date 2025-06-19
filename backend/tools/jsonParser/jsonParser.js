import { DynamicStructuredTool } from "@langchain/core/tools";

export const jsonParserTool = new DynamicStructuredTool({
  name: "json_parser",
  description:
    "only use this tool to parse a string into JSON. Input must be a string. Returns a parsed JSON object or an error if parsing fails.",
  schema: {
    type: "object",
    properties: {
      json_string: {
        type: "string",
        description: "The string to parse as JSON.",
      },
    },
    required: ["json_string"],
  },
  func: async ({ json_string }) => {
    try {
      return JSON.parse(json_string);
    } catch (err) {
      return { error: "Invalid JSON: " + err.message };
    }
  },
});
