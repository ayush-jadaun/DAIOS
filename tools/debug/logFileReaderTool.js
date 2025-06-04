import { DynamicStructuredTool } from "@langchain/core/tools";
import fs from "fs/promises";

export const logFileReaderTool = new DynamicStructuredTool({
  name: "log_file_reader",
  description:
    "Read the last N lines from a log file. Input: file path and number of lines to read.",
  schema: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Path to log file." },
      lines: {
        type: "integer",
        description: "Number of lines to read from the end.",
        default: 50,
      },
    },
    required: ["filePath"],
  },
  func: async ({ filePath, lines = 50 }) => {
    try {
      const data = await fs.readFile(filePath, "utf-8");
      const split = data.trim().split("\n");
      return split.slice(-lines).join("\n");
    } catch (err) {
      return { error: "Failed to read log file: " + err.message };
    }
  },
});
