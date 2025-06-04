import { DynamicStructuredTool } from "@langchain/core/tools";
import fs from "fs/promises";

export const logFetcherTool = new DynamicStructuredTool({
  name: "log_fetcher",
  description:
    "Fetches the last N lines from a log file. Input: file path and optional line count (default 50).",
  schema: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Path to the log file." },
      lines: {
        type: "number",
        description: "Number of lines from the end (default 50).",
      },
    },
    required: ["filePath"],
  },
  func: async ({ filePath, lines = 50 }) => {
    try {
      const data = await fs.readFile(filePath, "utf8");
      const split = data.trim().split("\n");
      return split.slice(-lines).join("\n");
    } catch (err) {
      return { error: "Failed to read log file: " + err.message };
    }
  },
});
