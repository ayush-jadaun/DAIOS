import { DynamicTool } from "@langchain/core/tools";
import { exec } from "child_process";

/**
 * cpuMemTool
 * Returns a snapshot of current system CPU and memory usage by invoking the 'top' command.
 * No input is required (accepts either an empty object or JSON string).
 * Output is a structured JSON object with the raw string result from 'top', a summary, and status information.
 */
export const cpuMemTool = new DynamicTool({
  name: "cpu_mem_usage",
  description:
    "Get current system CPU and memory usage statistics. Input should be an empty object or JSON string. Output includes the raw 'top' command output and a summary.",
  func: async (inputJSON) => {
    console.log("[CPU_MEM_TOOL] Tool called with input:", inputJSON);

    try {
      let parsedInput;

      // Accept empty object or JSON string
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          const errorMsg = `Failed to parse input JSON: ${parseError.message}. Input was: ${inputJSON}`;
          console.error("[CPU_MEM_TOOL]", errorMsg);
          return JSON.stringify({ error: errorMsg });
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        const errorMsg = `Invalid input type. Expected JSON string or object, got: ${typeof inputJSON}`;
        console.error("[CPU_MEM_TOOL]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }

      // No required fields to validate

      // Execute the top command and process output
      return await new Promise((resolve) => {
        exec("top -b -n 1 | head -15", (err, stdout, stderr) => {
          if (err) {
            const errorMsg =
              stderr || err.message || "Unknown error from top command";
            console.error("[CPU_MEM_TOOL]", errorMsg);
            resolve(JSON.stringify({ success: false, error: errorMsg }));
          } else {
            const summary = summarizeTopOutput(stdout);
            resolve(
              JSON.stringify({
                success: true,
                message: "Successfully retrieved CPU and memory usage.",
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
      const errorMsg = `CPU/memory tool error: ${err.message}`;
      console.error("[CPU_MEM_TOOL] Error:", errorMsg);
      return JSON.stringify({ error: errorMsg });
    }
  },
});

// Helper function to create a summary of the 'top' command output
function summarizeTopOutput(topOutput) {
  if (!topOutput) return "No data available.";
  const lines = topOutput.split("\n");
  const cpuLine = lines.find((l) => l.toLowerCase().includes("cpu")) || "";
  const memLine = lines.find((l) => l.toLowerCase().includes("mem")) || "";
  return `CPU: ${cpuLine.trim()} | MEM: ${memLine.trim()}`;
}
