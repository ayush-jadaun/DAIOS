import { DynamicTool } from "@langchain/core/tools";
import { exec } from "child_process";
import util from "util";
const execAsync = util.promisify(exec);

export const testRunnerTool = new DynamicTool({
  name: "test_runner",
  description:
    "Run the test suite for the project (e.g., npm test, pytest) and return the results. Input is an object or JSON string with optional 'command' field.",
  func: async (inputJSON) => {
    try {
      let parsedInput = {};
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch {
          parsedInput = {};
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      }
      const command = parsedInput.command || "npm test";
      const { stdout, stderr } = await execAsync(command, { timeout: 60000 });
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
