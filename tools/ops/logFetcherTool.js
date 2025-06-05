import { DynamicTool } from "@langchain/core/tools";
import fs from "fs/promises";
import path from "path";

/**
 * logFetcherTool
 * Fetches the last N lines from a log file.
 * Input: object or JSON string with 'filePath' (required) and optional 'lines' (number, default 50).
 * Returns a structured JSON object with the fetched log lines and status.
 */
export const logFetcherTool = new DynamicTool({
  name: "log_fetcher",
  description:
    "Fetch the last N lines from a log file. Input should be an object or JSON string with required 'filePath' and optional 'lines' (default 50). Output is a structured JSON object with the log lines.",
  func: async (inputJSON) => {
    console.log("[LOG_FETCHER_TOOL] Tool called with input:", inputJSON);

    try {
      let parsedInput;
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          const errorMsg = `Failed to parse input JSON: ${parseError.message}. Input was: ${inputJSON}`;
          console.error("[LOG_FETCHER_TOOL]", errorMsg);
          return JSON.stringify({ error: errorMsg });
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        const errorMsg = `Invalid input type. Expected JSON string or object, got: ${typeof inputJSON}`;
        console.error("[LOG_FETCHER_TOOL]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }

      const { filePath, lines = 50 } = parsedInput;

      if (!filePath || typeof filePath !== "string") {
        const errorMsg = "Missing or invalid required field: filePath";
        console.error("[LOG_FETCHER_TOOL]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }

      // Use sandbox directory for file safety
      const sandboxDir = path.join(process.cwd(), "sandbox");
      const absolutePath = path.resolve(sandboxDir, filePath);
      if (!absolutePath.startsWith(sandboxDir)) {
        const errorMsg = "Access denied: Path outside of sandbox";
        console.error("[LOG_FETCHER_TOOL]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }

      try {
        const data = await fs.readFile(absolutePath, "utf8");
        const split = data.trim().split("\n");
        const logLines = split.slice(-lines).join("\n");
        return JSON.stringify({
          success: true,
          message: `Fetched last ${lines} lines from ${filePath}.`,
          lines: logLines,
          stats: {
            totalLines: split.length,
            returnedLines: Math.min(lines, split.length),
            fileSize: data.length,
          },
        });
      } catch (err) {
        const errorMsg = "Failed to read log file: " + err.message;
        console.error("[LOG_FETCHER_TOOL]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }
    } catch (err) {
      const errorMsg = `Log fetcher tool error: ${err.message}`;
      console.error("[LOG_FETCHER_TOOL] Error:", errorMsg);
      return JSON.stringify({ error: errorMsg });
    }
  },
});
