import { DynamicTool } from "@langchain/core/tools";
import fs from "fs/promises";
import path from "path";

export const logFileReaderTool = new DynamicTool({
  name: "log_file_reader",
  description:
    "Read the last N lines from a log file. Input should be an object or JSON string with 'filePath' and optional 'lines' (number).",
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
      const filePath = parsedInput.filePath;
      const lines = parsedInput.lines || 50;
      if (!filePath) return { error: "Missing required field: filePath" };
      const sandboxDir = path.join(process.cwd(), "sandbox");
      const absolutePath = path.resolve(sandboxDir, filePath);
      if (!absolutePath.startsWith(sandboxDir))
        return { error: "Access denied: Path outside of sandbox" };
      const data = await fs.readFile(absolutePath, "utf-8");
      const split = data.trim().split("\n");
      return split.slice(-lines).join("\n");
    } catch (err) {
      return { error: "Failed to read log file: " + err.message };
    }
  },
});
