import { DynamicStructuredTool } from "@langchain/core/tools";
import { exec } from "child_process";
import util from "util";
const execAsync = util.promisify(exec);

export const testRunnerTool = new DynamicStructuredTool({
  name: "test_runner",
  description:
    "Run the test suite for the project (e.g., npm test, pytest) and return the results.",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The test command to run, e.g. 'npm test' or 'pytest'.",
        default: "npm test",
      },
    },
    required: [],
  },
  func: async ({ command = "npm test" }) => {
    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 60_000 });
      return { stdout, stderr };
    } catch (err) {
      return {
        error: "Test command failed: " + err.message,
        stdout: err.stdout,
        stderr: err.stderr,
      };
    }
  },
});
