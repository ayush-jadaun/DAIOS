import { DynamicTool } from "@langchain/core/tools";
import { exec } from "child_process";
import util from "util";
import path from "path";
import fs from "fs/promises";

const execAsync = util.promisify(exec);

function isEslintCommand(cmd) {
  return /^(\s*)eslint(\s|$)/.test(cmd);
}

function isPylintCommand(cmd) {
  return /^(\s*)pylint(\s|$)/.test(cmd);
}

function sanitizeFilePath(filePath) {
  if (!filePath) return null;

  // Remove any shell metacharacters that could be dangerous
  const sanitized = filePath.replace(/[;&|`$(){}[\]]/g, "");

  // Normalize the path to prevent directory traversal
  const normalized = path.normalize(sanitized);

  // Ensure it doesn't start with .. or contain ../ (basic directory traversal protection)
  if (normalized.startsWith("..") || normalized.includes("../")) {
    throw new Error("Invalid file path: directory traversal not allowed");
  }

  return normalized;
}

function isAllowedCommand(command) {
  // Whitelist of allowed linter commands
  const allowedCommands = [
    /^(\s*)eslint(\s|$)/,
    /^(\s*)pylint(\s|$)/,
    /^(\s*)flake8(\s|$)/,
    /^(\s*)black(\s|$)/,
    /^(\s*)prettier(\s|$)/,
    /^(\s*)tslint(\s|$)/,
    /^(\s*)stylelint(\s|$)/,
  ];

  return allowedCommands.some((pattern) => pattern.test(command));
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findMatchingFiles(pattern, cwd = process.cwd()) {
  try {
    // Simple glob-like matching for common patterns
    if (pattern.includes("*")) {
      const files = await fs.readdir(cwd);
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      return files.filter((file) => regex.test(file));
    }

    // Check if exact file exists
    if (await fileExists(path.resolve(cwd, pattern))) {
      return [pattern];
    }

    return [];
  } catch {
    return [];
  }
}

async function hasEslintConfig(cwd = process.cwd()) {
  const configFiles = [
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    ".eslintrc.js",
    ".eslintrc.json",
    ".eslintrc.yml",
    ".eslintrc.yaml",
    ".eslintrc",
  ];

  for (const configFile of configFiles) {
    if (await fileExists(path.resolve(cwd, configFile))) {
      return { exists: true, file: configFile };
    }
  }

  return { exists: false, file: null };
}

export const linterTool = new DynamicTool({
  name: "linter",
  description:
    "Run a linter (such as ESLint, Pylint, flake8, black, prettier) on the codebase or a specific file. Input should be an object with 'filePath' (optional), 'command' (optional, defaults to 'eslint'), and 'useNoConfig' (optional, for ESLint without config file). Returns the linter problems in structured format.",
  func: async (inputJSON) => {
    try {
      let parsedInput = {};

      // Handle both string and object inputs
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          return {
            error: "Invalid JSON input",
            details: parseError.message,
          };
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        return {
          error: "Input must be a JSON object or string",
        };
      }

      let { filePath, command, useNoConfig } = parsedInput;

      // Default to eslint
      command = command || "eslint";

      // Security: Only allow whitelisted linter commands
      if (!isAllowedCommand(command)) {
        return {
          error: `Command not allowed: ${command}. Only linter tools are permitted.`,
        };
      }

      // Security: Sanitize file path
      if (filePath) {
        try {
          filePath = sanitizeFilePath(filePath);
        } catch (securityError) {
          return {
            error: securityError.message,
          };
        }

        // Check if file exists before running linter
        const matchingFiles = await findMatchingFiles(filePath);
        if (matchingFiles.length === 0) {
          // Try to list available files for better error messaging
          try {
            const currentDir = await fs.readdir(process.cwd());
            const jsFiles = currentDir.filter(
              (file) =>
                file.endsWith(".js") ||
                file.endsWith(".ts") ||
                file.endsWith(".jsx") ||
                file.endsWith(".tsx")
            );

            return {
              error: `File not found: ${filePath}`,
              suggestion:
                jsFiles.length > 0
                  ? `Available files in current directory: ${jsFiles
                      .slice(0, 10)
                      .join(", ")}${jsFiles.length > 10 ? "..." : ""}`
                  : "No JavaScript/TypeScript files found in current directory",
              availableFiles: jsFiles,
            };
          } catch {
            return {
              error: `File not found: ${filePath}`,
              suggestion:
                "Please check the file path and ensure the file exists",
            };
          }
        }
      }

      // Build the final command
      let useJson = false;
      let finalCmd = command;

      if (isEslintCommand(command)) {
        useJson = true;

        // Check for ESLint configuration unless explicitly bypassed
        if (!useNoConfig) {
          const configCheck = await hasEslintConfig();
          if (!configCheck.exists) {
            return {
              error: "ESLint configuration file not found",
              details:
                "ESLint v9+ requires eslint.config.js or legacy .eslintrc.* files",
              suggestion:
                "Create an eslint.config.js file or retry with useNoConfig: true for basic linting",
              configOptions: {
                recommended:
                  "Create eslint.config.js with: export default [{ files: ['**/*.js'], rules: {} }];",
                legacy:
                  "Migrate .eslintrc.* files using: https://eslint.org/docs/latest/use/configure/migration-guide",
                bypass:
                  "Set useNoConfig: true in input to use built-in rules only",
              },
            };
          }
        }

        // Add -f json if not specified
        if (!/\s+-f\s+json\b/.test(command)) {
          finalCmd += " -f json";
        }

        // Add --no-config-lookup if requested
        if (useNoConfig && !/\s+--no-config-lookup\b/.test(command)) {
          finalCmd += " --no-config-lookup";
        }

        if (filePath) {
          finalCmd += ` "${filePath}"`;
        } else {
          // If no file specified, try to lint common patterns
          finalCmd += " .";
        }
      } else if (isPylintCommand(command)) {
        useJson = true;
        if (!/\s+--output-format=json\b/.test(command)) {
          finalCmd += " --output-format=json";
        }
        if (filePath) {
          finalCmd += ` "${filePath}"`;
        } else {
          // If no file specified, try to lint all Python files
          finalCmd += " .";
        }
      } else {
        // For other linters, just append filePath if provided
        if (filePath) {
          finalCmd += ` "${filePath}"`;
        } else {
          finalCmd += " .";
        }
      }

      // Execute the command with timeout and proper options
      const { stdout, stderr } = await execAsync(finalCmd, {
        timeout: 60000,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer limit
        cwd: process.cwd(), // Explicitly set working directory
      });

      // If we forced JSON output, try to parse it
      if (useJson) {
        try {
          const lintResults = JSON.parse(stdout || "[]");
          return {
            success: true,
            problems: lintResults,
            problemCount: Array.isArray(lintResults)
              ? lintResults.reduce(
                  (total, file) =>
                    total + (file.messages ? file.messages.length : 0),
                  0
                )
              : 0,
            raw: stdout,
            stderr: stderr || null,
          };
        } catch (jsonError) {
          return {
            error: "Failed to parse linter output as JSON",
            stdout,
            stderr,
            parseError: jsonError.message,
          };
        }
      }

      // For non-JSON output, return raw results
      return {
        success: true,
        stdout,
        stderr: stderr || null,
      };
    } catch (err) {
      // Handle different types of execution errors
      if (err.code === "ENOENT") {
        return {
          error: `Linter command not found. Make sure the linter is installed.`,
          command: err.cmd || "unknown",
          suggestion:
            "Try running 'npm install -g eslint' or install the appropriate linter",
        };
      }

      if (err.signal === "SIGTERM") {
        return {
          error: "Linter execution timed out (60 seconds)",
        };
      }

      // Special handling for ESLint configuration errors
      if (
        err.stderr &&
        err.stderr.includes("ESLint couldn't find an eslint.config")
      ) {
        return {
          error: "ESLint configuration file missing",
          details: "ESLint v9+ requires eslint.config.js configuration file",
          suggestion: "Create eslint.config.js or use --no-config-lookup flag",
          quickFix: {
            createConfig:
              "Create eslint.config.js with: export default [{ files: ['**/*.js'], rules: {} }];",
            useNoConfig:
              "Add --no-config-lookup to command for basic linting without config",
            migrationGuide:
              "https://eslint.org/docs/latest/use/configure/migration-guide",
          },
          stderr: err.stderr,
        };
      }

      // Special handling for ESLint "no files found" error
      if (err.stderr && err.stderr.includes("No files matching the pattern")) {
        return {
          error:
            "ESLint could not find any files matching the specified pattern",
          details: err.stderr,
          suggestion:
            "Check the file path or try running without specifying a file to lint the entire project",
        };
      }

      return {
        error: "Linter execution failed: " + err.message,
        stdout: err.stdout || null,
        stderr: err.stderr || null,
        code: err.code || null,
      };
    }
  },
});
