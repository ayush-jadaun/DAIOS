import { DynamicStructuredTool } from "@langchain/core/tools";
import { exec } from "child_process";

export const dockerTool = new DynamicStructuredTool({
  name: "docker_manager",
  description:
    "List, start, or stop Docker containers. Input: action ('list', 'start', 'stop'), and container name/id for start/stop.",
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "start", "stop"],
        description: "Action to perform.",
      },
      container: {
        type: "string",
        description: "Container name or ID (required for start/stop).",
      },
    },
    required: ["action"],
  },
  func: async ({ action, container }) => {
    let cmd = "";
    if (action === "list") cmd = "docker ps -a";
    else if (action === "start" && container) cmd = `docker start ${container}`;
    else if (action === "stop" && container) cmd = `docker stop ${container}`;
    else
      return "Invalid parameters. Provide a container name/id for start/stop.";
    return new Promise((resolve) => {
      exec(cmd, (err, stdout, stderr) => {
        if (err) resolve(stderr || err.message);
        else resolve(stdout);
      });
    });
  },
});
