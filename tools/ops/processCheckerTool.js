import { DynamicStructuredTool } from "@langchain/core/tools";
import { exec } from "child_process";
export const processCheckerTool = new DynamicStructuredTool({
  name: "process_checker",
  description:
    "Get a list of running processes, optionally filtered by a search string.",
  schema: {
    type: "object",
    properties: {
      search: {
        type: "string",
        description: "String to filter processes (optional)",
      },
    },
  },
  func: async ({ search }) => {
    return new Promise((resolve) => {
      exec(
        `ps aux${search ? ` | grep ${search}` : ""}`,
        (err, stdout, stderr) => {
          if (err) return resolve({ error: stderr });
          resolve(stdout);
        }
      );
    });
  },
});
