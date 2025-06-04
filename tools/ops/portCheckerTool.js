import { DynamicStructuredTool } from "@langchain/core/tools";
import net from "net";

export const portCheckerTool = new DynamicStructuredTool({
  name: "port_checker",
  description: "Check if a port on localhost is open. Input: port number.",
  schema: {
    type: "object",
    properties: {
      port: { type: "number", description: "Port to check." },
    },
    required: ["port"],
  },
  func: async ({ port }) => {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.on("connect", function () {
        socket.destroy();
        resolve(`Port ${port} is open.`);
      });
      socket.on("timeout", function () {
        socket.destroy();
        resolve(`Port ${port} is closed (timeout).`);
      });
      socket.on("error", function () {
        resolve(`Port ${port} is closed.`);
      });
      socket.connect(port, "127.0.0.1");
    });
  },
});
