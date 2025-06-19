import { DynamicTool } from "@langchain/core/tools";
import net from "net";

/**
 * portCheckerTool
 * Checks if a port on localhost is open.
 * Input: object or JSON string with required 'port' (number).
 * Returns a structured JSON object with the port status and message.
 */
export const portCheckerTool = new DynamicTool({
  name: "port_checker",
  description:
    "Check if a port on localhost is open. Input should be an object or JSON string with required 'port' (number). Output is a structured JSON object with the port status.",
  func: async (inputJSON) => {
    console.log("[PORT_CHECKER_TOOL] Tool called with input:", inputJSON);

    try {
      let parsedInput;
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          const errorMsg = `Failed to parse input JSON: ${parseError.message}. Input was: ${inputJSON}`;
          console.error("[PORT_CHECKER_TOOL]", errorMsg);
          return JSON.stringify({ error: errorMsg });
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        const errorMsg = `Invalid input type. Expected JSON string or object, got: ${typeof inputJSON}`;
        console.error("[PORT_CHECKER_TOOL]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }

      const { port } = parsedInput;
      if (!port || typeof port !== "number") {
        const errorMsg = "Missing or invalid required field: port (number)";
        console.error("[PORT_CHECKER_TOOL]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }

      return await new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1000);
        socket.on("connect", function () {
          socket.destroy();
          resolve(
            JSON.stringify({
              success: true,
              port,
              status: "open",
              message: `Port ${port} is open.`,
            })
          );
        });
        socket.on("timeout", function () {
          socket.destroy();
          resolve(
            JSON.stringify({
              success: false,
              port,
              status: "closed",
              message: `Port ${port} is closed (timeout).`,
            })
          );
        });
        socket.on("error", function () {
          resolve(
            JSON.stringify({
              success: false,
              port,
              status: "closed",
              message: `Port ${port} is closed.`,
            })
          );
        });
        socket.connect(port, "127.0.0.1");
      });
    } catch (err) {
      const errorMsg = `Port checker tool error: ${err.message}`;
      console.error("[PORT_CHECKER_TOOL] Error:", errorMsg);
      return JSON.stringify({ error: errorMsg });
    }
  },
});
