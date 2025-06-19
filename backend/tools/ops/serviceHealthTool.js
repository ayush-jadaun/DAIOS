import { DynamicTool } from "@langchain/core/tools";
import { exec } from "child_process";

/**
 * serviceHealthTool
 * Checks the status of a systemd service.
 * Input: object or JSON string with required 'service' (string).
 * Returns a structured JSON object with the service status and logs.
 */
export const serviceHealthTool = new DynamicTool({
  name: "service_health_checker",
  description:
    "Check the status of a systemd service. Input should be an object or JSON string with required 'service' (string). Output is a structured JSON object with the service status.",
  func: async (inputJSON) => {
    console.log("[SERVICE_HEALTH_TOOL] Tool called with input:", inputJSON);

    try {
      let parsedInput;
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          const errorMsg = `Failed to parse input JSON: ${parseError.message}. Input was: ${inputJSON}`;
          console.error("[SERVICE_HEALTH_TOOL]", errorMsg);
          return JSON.stringify({ error: errorMsg });
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        const errorMsg = `Invalid input type. Expected JSON string or object, got: ${typeof inputJSON}`;
        console.error("[SERVICE_HEALTH_TOOL]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }

      const { service } = parsedInput;
      if (!service || typeof service !== "string") {
        const errorMsg = "Missing or invalid required field: service (string)";
        console.error("[SERVICE_HEALTH_TOOL]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }

      const cmd = `systemctl status ${service} --no-pager`;
      return await new Promise((resolve) => {
        exec(cmd, (err, stdout, stderr) => {
          if (err) {
            const errorMsg =
              stderr || err.message || "Unknown error from systemctl";
            console.error("[SERVICE_HEALTH_TOOL]", errorMsg);
            resolve(JSON.stringify({ success: false, error: errorMsg }));
          } else {
            resolve(
              JSON.stringify({
                success: true,
                message: `Fetched status for service: ${service}`,
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
      const errorMsg = `Service health tool error: ${err.message}`;
      console.error("[SERVICE_HEALTH_TOOL] Error:", errorMsg);
      return JSON.stringify({ error: errorMsg });
    }
  },
});
