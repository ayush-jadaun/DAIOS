import { DynamicTool } from "@langchain/core/tools";
import { exec } from "child_process";
import util from "util";
const execAsync = util.promisify(exec);

function isEslintCommand(cmd) {
  return /^(\s*)eslint(\s|$)/.test(cmd);
}
function isPylintCommand(cmd) {
  return /^(\s*)pylint(\s|$)/.test(cmd);
}

export const linterTool = new DynamicTool({
  name: "linter",
  description:
    "Run a linter (such as ESLint or Pylint) on the codebase or a specific file. Input should be an object or JSON string with 'filePath' and/or 'command'. Returns the linter problems (if any) in structured format.",
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
      let { filePath, command } = parsedInput;

      // Default to eslint
      command = command || "eslint";

      // If eslint, force JSON output
      let useJson = false;
      let finalCmd = command;
      if (isEslintCommand(command)) {
        useJson = true;
        // Add -f json if not specified
        if (!/\s+-f\s+json\b/.test(command)) {
          finalCmd += " -f json";
        }
        if (filePath) finalCmd += ` ${filePath}`;
      }
      // If pylint, force JSON output
      else if (isPylintCommand(command)) {
        useJson = true;
        if (!/\s+--output-format=json\b/.test(command)) {
          finalCmd += " --output-format=json";
        }
        if (filePath) finalCmd += ` ${filePath}`;
      } else {
        // generic: just append filePath if any
        if (filePath) finalCmd += ` ${filePath}`;
      }

      const { stdout, stderr } = await execAsync(finalCmd, { timeout: 60000 });

      // If we forced JSON, try parse it for issues
      if (useJson) {
        try {
          // For ESLint, the entire stdout is a JSON array
          // For Pylint, the entire stdout is a JSON array
          const lintResults = JSON.parse(stdout);
          // Structure output:
          return {
            problems: lintResults,
            raw: stdout,
            stderr,
          };
        } catch (e) {
          // fallback
          return {
            error: "Failed to parse linter output as JSON",
            stdout,
            stderr,
          };
        }
      }

      // Otherwise, just return the output
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