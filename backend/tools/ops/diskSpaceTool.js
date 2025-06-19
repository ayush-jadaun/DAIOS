import { DynamicTool } from "@langchain/core/tools";
import { exec } from "child_process";

/**
 * diskSpaceTool
 * Reports disk usage and free space using the `df -h` command.
 * Accepts an empty object or JSON string as input (no parameters required).
 * Returns a structured JSON object with the raw command output, a summary, and status.
 */
export const diskSpaceTool = new DynamicTool({
  name: "disk_space",
  description:
    "Report disk usage and free space. Input should be an empty object or JSON string. Output includes the raw 'df -h' command output and a summary.",
  func: async (inputJSON) => {
    console.log("[DISK_SPACE_TOOL] Tool called with input:", inputJSON);

    try {
      let parsedInput;

      // Accept empty object or JSON string (no required fields)
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          const errorMsg = `Failed to parse input JSON: ${parseError.message}. Input was: ${inputJSON}`;
          console.error("[DISK_SPACE_TOOL]", errorMsg);
          return JSON.stringify({ error: errorMsg });
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        const errorMsg = `Invalid input type. Expected JSON string or object, got: ${typeof inputJSON}`;
        console.error("[DISK_SPACE_TOOL]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }

      // Run the df -h command
      return await new Promise((resolve) => {
        exec("df -h", (err, stdout, stderr) => {
          if (err) {
            const errorMsg =
              stderr || err.message || "Unknown error from df command";
            console.error("[DISK_SPACE_TOOL]", errorMsg);
            resolve(JSON.stringify({ success: false, error: errorMsg }));
          } else {
            const summary = summarizeDiskSpace(stdout);
            resolve(
              JSON.stringify({
                success: true,
                message: "Successfully retrieved disk usage information.",
                output: stdout,
                summary,
                stats: {
                  lines: stdout ? stdout.split("\n").length : 0,
                  outputLength: stdout ? stdout.length : 0,
                },
              })
            );
          }
        });
      });
    } catch (err) {
      const errorMsg = `Disk space tool error: ${err.message}`;
      console.error("[DISK_SPACE_TOOL] Error:", errorMsg);
      return JSON.stringify({ error: errorMsg });
    }
  },
});

// Helper function to summarize disk space usage from 'df -h' output
function summarizeDiskSpace(dfOutput) {
  if (!dfOutput) return "No data available.";
  const lines = dfOutput.split("\n").filter(Boolean);
  const rootLine = lines.find((l) => l.includes(" /")) || "";
  const usedPercentMatch = rootLine.match(/\s(\d+%)\s/);
  const usedPercent = usedPercentMatch ? usedPercentMatch[1] : "unknown";
  return `Root filesystem usage: ${usedPercent}.`;
}
