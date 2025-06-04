import { DynamicStructuredTool } from "@langchain/core/tools";
import fs from "fs/promises";

export const ciConfigTool = new DynamicStructuredTool({
  name: "ci_config_tool",
  description:
    "Generate or update CI/CD configuration files (e.g. GitHub Actions, GitLab CI). Input: file path and config content (YAML or JSON as string).",
  schema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description:
          "Path to the CI/CD config file (e.g. .github/workflows/ci.yml).",
      },
      config: { type: "string", description: "CI/CD configuration content." },
      writeMode: {
        type: "string",
        enum: ["overwrite", "append"],
        default: "overwrite",
        description: "How to write to the file.",
      },
    },
    required: ["filePath", "config"],
  },
  func: async ({ filePath, config, writeMode = "overwrite" }) => {
    try {
      if (writeMode === "append") {
        await fs.appendFile(filePath, config);
        return `CI config appended to ${filePath}`;
      } else {
        await fs.writeFile(filePath, config);
        return `CI config written (overwritten) to ${filePath}`;
      }
    } catch (err) {
      return { error: "Failed to write CI config: " + err.message };
    }
  },
});
