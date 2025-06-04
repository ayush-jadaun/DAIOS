import { DynamicStructuredTool } from "@langchain/core/tools";
import fs from "fs/promises";
import yaml from "js-yaml";

export const yamlParserTool = new DynamicStructuredTool({
  name: "yaml_parser",
  description:
    "Parse a YAML file and return its contents as JSON. Input: file path.",
  schema: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Path to the YAML file." },
    },
    required: ["filePath"],
  },
  func: async ({ filePath }) => {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return yaml.load(content);
    } catch (err) {
      return { error: "Failed to parse YAML file: " + err.message };
    }
  },
});
