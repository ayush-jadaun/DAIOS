import { DynamicStructuredTool } from "@langchain/core/tools";
import { exec } from "child_process";

export const cpuMemTool = new DynamicStructuredTool({
  name: "cpu_mem_usage",
  description: "Get system CPU and memory usage.",
  schema: { type: "object", properties: {} },
  func: async () => {
    return new Promise((resolve) => {
      exec("top -b -n 1 | head -15", (err, stdout, stderr) => {
        if (err) {
          resolve(stderr || err.message);
        } else {
          resolve(stdout);
        }
      });
    });
  },
});
