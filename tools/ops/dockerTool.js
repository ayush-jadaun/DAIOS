import { DynamicTool } from "@langchain/core/tools";
import { exec } from "child_process";

/**
 * dockerTool
 * Manages Docker containers: list all, start, or stop a container.
 * Input: object or JSON string with required 'action' field ('list', 'start', 'stop'), and 'container' for 'start'/'stop'.
 * Output: structured JSON object with result, command, and error/message if any.
 */
export const dockerTool = new DynamicTool({
  name: "docker_manager",
  description:
    "List, start, or stop Docker containers. Input should be an object or JSON string with required field 'action' ('list', 'start', 'stop'), and 'container' (name or ID) for 'start'/'stop'. Output includes the command output and a summary.",
  func: async (inputJSON) => {
    console.log("[DOCKER_TOOL] Tool called with input:", inputJSON);

    try {
      let parsedInput;

      // Parse JSON input
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          const errorMsg = `Failed to parse input JSON: ${parseError.message}. Input was: ${inputJSON}`;
          console.error("[DOCKER_TOOL]", errorMsg);
          return JSON.stringify({ error: errorMsg });
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        const errorMsg = `Invalid input type. Expected JSON string or object, got: ${typeof inputJSON}`;
        console.error("[DOCKER_TOOL]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }

      const { action, container } = parsedInput;

      // Validate required field
      if (!action || !["list", "start", "stop"].includes(action)) {
        const errorMsg =
          "Missing or invalid required field: action. Must be one of 'list', 'start', or 'stop'.";
        console.error("[DOCKER_TOOL]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }
      if ((action === "start" || action === "stop") && !container) {
        const errorMsg =
          "Missing required field: container (name or ID) for 'start' or 'stop' actions.";
        console.error("[DOCKER_TOOL]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }

      let cmd = "";
      if (action === "list") cmd = "docker ps -a";
      else if (action === "start") cmd = `docker start ${container}`;
      else if (action === "stop") cmd = `docker stop ${container}`;

      return await new Promise((resolve) => {
        exec(cmd, (err, stdout, stderr) => {
          if (err) {
            const errorMsg =
              stderr || err.message || "Unknown error from docker command";
            console.error("[DOCKER_TOOL]", errorMsg);
            resolve(
              JSON.stringify({ success: false, error: errorMsg, command: cmd })
            );
          } else {
            resolve(
              JSON.stringify({
                success: true,
                action,
                container: container || null,
                command: cmd,
                output: stdout,
                summary: summarizeDocker(action, stdout),
              })
            );
          }
        });
      });
    } catch (err) {
      const errorMsg = `Docker tool error: ${err.message}`;
      console.error("[DOCKER_TOOL] Error:", errorMsg);
      return JSON.stringify({ error: errorMsg });
    }
  },
});

// Helper function to summarize docker command output
function summarizeDocker(action, out) {
  if (!out) return "No data available.";
  if (action === "list") {
    const lines = out.split("\n").filter(Boolean);
    return `Found ${lines.length - 1} container(s).`;
  }
  return out.trim();
}
