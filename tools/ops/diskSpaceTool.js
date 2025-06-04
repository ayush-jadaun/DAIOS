import { DynamicStructuredTool } from "@langchain/core/tools";
import { exec } from "child_process";
export const diskSpaceTool = new DynamicStructuredTool({
  name: "disk_space",
  description: "Report disk usage and free space.",
  schema: { type: "object", properties: {} },
  func: async () => {
    return new Promise((resolve) => {
      exec("df -h", (err, stdout, stderr) => {
        if (err) return resolve({ error: stderr });
        resolve(stdout);
      });
    });
  },
});
