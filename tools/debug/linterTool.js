import { DynamicTool } from "@langchain/core/tools";
import { exec } from "child_process";
import util from "util";
const execAsync = util.promisify(exec);

export const linterTool = new DynamicTool({
  name: "linter",
  description:
    "Run a linter (such as ESLint or Pylint) on the codebase or a specific file. Input should be an object or JSON string with 'filePath' and/or 'command'.",
  func: async (inputJSON) => {
    try {
      let parsedInput = {};
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch {}
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      }
      const filePath = parsedInput.filePath || "";
      const command = parsedInput.command || "eslint .";
      const fullCmd = filePath ? `${command} ${filePath}` : command;
      const { stdout, stderr } = await execAsync(fullCmd, { timeout: 60000 });
      return { stdout, stderr };
    } catch (err) {
      return {
        error: "Linter failed: " + err.message,
        stdout: err.stdout,
        stderr: err.stderr,
      };
    }
  },
});
