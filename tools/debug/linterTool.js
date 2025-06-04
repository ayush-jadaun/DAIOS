import { DynamicStructuredTool } from "@langchain/core/tools";
import { exec } from "child_process";
import util from "util";
const execAsync = util.promisify(exec);

export const linterTool = new DynamicStructuredTool({
  name: "linter",
  description:
    "Run a linter (such as ESLint or Pylint) on the codebase or a specific file. Input: optional file path. Output: linter output and errors.",
  schema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description:
          "The file or directory to lint. Leave empty to lint the whole project.",
        default: "",
      },
      command: {
        type: "string",
        description: "The linter command to run, e.g. 'eslint' or 'pylint'.",
        default: "eslint .",
      },
    },
    required: [],
  },
  func: async ({ filePath = "", command = "eslint ." }) => {
    try {
      const fullCmd = filePath ? `${command} ${filePath}` : command;
      const { stdout, stderr } = await execAsync(fullCmd, { timeout: 60_000 });
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
