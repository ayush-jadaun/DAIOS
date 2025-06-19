import { DynamicTool } from "@langchain/core/tools";
import { exec } from "child_process";

/**
 * processCheckerTool
 * Gets a list of running processes, optionally filtered by a search string.
 * Input: object or JSON string with optional 'search' (string).
 * Returns a structured JSON object with the process list.
 */
export const processCheckerTool = new DynamicTool({
  name: "process_checker",
  description:
    "Get a list of running processes, optionally filtered by a search string. Input should be an object or JSON string with optional 'search' field.",
  func: async (inputJSON) => {
    console.log("[PROCESS_CHECKER_TOOL] Tool called with input:", inputJSON);

    try {
      let parsedInput;
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          const errorMsg = `Failed to parse input JSON: ${parseError.message}. Input was: ${inputJSON}`;
          console.error("[PROCESS_CHECKER_TOOL]", errorMsg);
          return JSON.stringify({ error: errorMsg });
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        const errorMsg = `Invalid input type. Expected JSON string or object, got: ${typeof inputJSON}`;
        console.error("[PROCESS_CHECKER_TOOL]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }

      const { search } = parsedInput;

      const cmd = `ps aux${search ? ` | grep ${search}` : ""}`;
      return await new Promise((resolve) => {
        exec(cmd, (err, stdout, stderr) => {
          if (err) {
            const errorMsg =
              stderr || err.message || "Unknown error from ps command";
            console.error("[PROCESS_CHECKER_TOOL]", errorMsg);
            resolve(JSON.stringify({ success: false, error: errorMsg }));
          } else {
            resolve(
              JSON.stringify({
                success: true,
                message: `Fetched process list${
                  search ? ` filtered by "${search}"` : ""
                }.`,
                output: stdout,
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
      const errorMsg = `Process checker tool error: ${err.message}`;
      console.error("[PROCESS_CHECKER_TOOL] Error:", errorMsg);
      return JSON.stringify({ error: errorMsg });
    }
  },
});
