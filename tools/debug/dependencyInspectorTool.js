import { DynamicStructuredTool } from "@langchain/core/tools";
import fs from "fs/promises";

export const dependencyInspectorTool = new DynamicStructuredTool({
  name: "dependency_inspector",
  description:
    "Read and parse package.json or requirements.txt to list dependencies. Input: file path.",
  schema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Path to package.json or requirements.txt.",
      },
    },
    required: ["filePath"],
  },
  func: async ({ filePath }) => {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      if (filePath.endsWith("package.json")) {
        const parsed = JSON.parse(content);
        return parsed.dependencies || {};
      } else if (filePath.endsWith("requirements.txt")) {
        return content.split("\n").filter(Boolean);
      } else {
        return { error: "Unsupported file type for dependency inspection." };
      }
    } catch (err) {
      return { error: "Failed to read dependency file: " + err.message };
    }
  },
});
