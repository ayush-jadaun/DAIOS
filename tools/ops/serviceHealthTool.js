import { DynamicStructuredTool } from "@langchain/core/tools";
import { exec } from "child_process";

export const serviceHealthTool = new DynamicStructuredTool({
  name: "service_health_checker",
  description: "Check the status of a systemd service. Input: service name.",
  schema: {
    type: "object",
    properties: {
      service: {
        type: "string",
        description: "Systemd service name (e.g., nginx, docker).",
      },
    },
    required: ["service"],
  },
  func: async ({ service }) => {
    return new Promise((resolve) => {
      exec(`systemctl status ${service} --no-pager`, (err, stdout, stderr) => {
        if (err) {
          resolve(stderr || err.message);
        } else {
          resolve(stdout);
        }
      });
    });
  },
});
