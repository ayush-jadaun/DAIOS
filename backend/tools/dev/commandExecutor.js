import { DynamicTool } from "@langchain/core/tools";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

// Configuration
const ALLOWED_COMMANDS = [
  // Package managers
  "npm",
  "yarn",
  "pnpm",
  "bun",
  // Node.js
  "node",
  "npx",
  // Git
  "git",
  // Build tools
  "tsc",
  "webpack",
  "vite",
  "rollup",
  // Linting/formatting
  "eslint",
  "prettier",
  "stylelint",
  // Testing
  "jest",
  "mocha",
  "vitest",
  "cypress",
  // Docker (if needed)
  "docker",
  "docker-compose",
  // General utilities
  "ls",
  "dir",
  "pwd",
  "cat",
  "echo",
  "mkdir",
  "rmdir",
  "apt-get",
  "cd",
  // Process management
  "ps",
  "kill",
  "pkill",
  "init",
];

const DANGEROUS_COMMANDS = [
  "sudo",
  "su",
  "chmod",
  "chown",
  "mv",
  "cp",
  "wget",
  "curl",
  "ssh",
  "scp",
  "rsync",
  "shutdown",
  "reboot",
  "halt",
  ,
];

const MAX_EXECUTION_TIME = 300000; // 5 minutes
const MAX_OUTPUT_LENGTH = 10000; // Limit output to prevent overwhelming responses

function sanitizeCommand(command) {
  if (!command || typeof command !== "string") {
    throw new Error("Command must be a non-empty string");
  }

  const trimmed = command.trim();
  if (trimmed.length === 0) {
    throw new Error("Command cannot be empty");
  }

  // Basic command validation
  const commandParts = trimmed.split(/\s+/);
  const baseCommand = commandParts[0].toLowerCase();

  // Check for dangerous commands
  if (DANGEROUS_COMMANDS.some((dangerous) => baseCommand.includes(dangerous))) {
    throw new Error(`Dangerous command detected: ${baseCommand}`);
  }

  // Check if command is allowed
  if (!ALLOWED_COMMANDS.some((allowed) => baseCommand.startsWith(allowed))) {
    throw new Error(
      `Command not allowed: ${baseCommand}. Allowed commands: ${ALLOWED_COMMANDS.join(
        ", "
      )}`
    );
  }

  // Prevent command injection
  if (
    trimmed.includes(";") ||
    trimmed.includes("&&") ||
    trimmed.includes("||") ||
    trimmed.includes("|") ||
    trimmed.includes(">") ||
    trimmed.includes("<") ||
    trimmed.includes("`") ||
    trimmed.includes("$(")
  ) {
    throw new Error("Command injection patterns detected");
  }

  return trimmed;
}

function truncateOutput(output, maxLength = MAX_OUTPUT_LENGTH) {
  if (!output || output.length <= maxLength) return output;
  return output.substring(0, maxLength) + "\n... [output truncated]";
}

async function executeCommand(command, workingDir = null) {
  const sanitizedCommand = sanitizeCommand(command);
  const cwd = workingDir || process.cwd();

  console.log(`[CommandExecutor] Executing: ${sanitizedCommand} in ${cwd}`);

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Command timed out after ${MAX_EXECUTION_TIME}ms`));
    }, MAX_EXECUTION_TIME);

    // Use exec for simpler commands, spawn for more complex ones
    const child = exec(
      sanitizedCommand,
      {
        cwd: cwd,
        timeout: MAX_EXECUTION_TIME,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        env: {
          ...process.env,
          // Add any additional environment variables if needed
          NODE_ENV: process.env.NODE_ENV || "development",
        },
      },
      (error, stdout, stderr) => {
        clearTimeout(timeoutId);

        if (error) {
          console.error(`[CommandExecutor] Error:`, error.message);
          resolve({
            success: false,
            command: sanitizedCommand,
            exitCode: error.code || 1,
            stdout: truncateOutput(stdout),
            stderr: truncateOutput(stderr),
            error: error.message,
            duration: Date.now() - startTime,
          });
        } else {
          console.log(`[CommandExecutor] Success:`, sanitizedCommand);
          resolve({
            success: true,
            command: sanitizedCommand,
            exitCode: 0,
            stdout: truncateOutput(stdout),
            stderr: truncateOutput(stderr),
            duration: Date.now() - startTime,
          });
        }
      }
    );

    const startTime = Date.now();

    // Handle process errors
    child.on("error", (error) => {
      clearTimeout(timeoutId);
      console.error(`[CommandExecutor] Process error:`, error.message);
      resolve({
        success: false,
        command: sanitizedCommand,
        exitCode: 1,
        stdout: "",
        stderr: error.message,
        error: `Process error: ${error.message}`,
        duration: Date.now() - startTime,
      });
    });
  });
}

export const commandExecutorTool = new DynamicTool({
  name: "command_executor",
  description: `Execute terminal/shell commands safely. Input is an object or JSON string with 'command' (required) and optional 'workingDir'. 
  
  Allowed commands include: ${ALLOWED_COMMANDS.join(", ")}
  
  Examples:
  - {"command": "npm install express"}
  - {"command": "npm run build"}
  - {"command": "git status"}
  - {"command": "ls -la", "workingDir": "/path/to/project"}
  
  Returns execution results with stdout, stderr, exit code, and success status.`,

  func: async (inputJSON) => {
    const startTime = Date.now();

    try {
      console.log("[CommandExecutor] Input received:", inputJSON);

      // Parse input like other tools
      let parsedInput = {};
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          // If JSON parsing fails, treat as simple command string
          parsedInput = { command: inputJSON };
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        return JSON.stringify({
          success: false,
          error:
            "Invalid input format. Expected object or JSON string with 'command' field.",
          duration: Date.now() - startTime,
        });
      }

      const { command, workingDir } = parsedInput;

      if (!command) {
        return JSON.stringify({
          success: false,
          error: "Command is required. Please provide a command to execute.",
          duration: Date.now() - startTime,
        });
      }

      // Validate working directory if provided
      let validWorkingDir = null;
      if (workingDir) {
        try {
          validWorkingDir = path.resolve(workingDir);
          // Additional security check - ensure it's within allowed paths
          const projectRoot = process.env.PROJECT_ROOT || process.cwd();
          if (!validWorkingDir.startsWith(path.resolve(projectRoot))) {
            throw new Error("Working directory must be within project root");
          }
        } catch (error) {
          return JSON.stringify({
            success: false,
            error: `Invalid working directory: ${error.message}`,
            duration: Date.now() - startTime,
          });
        }
      }

      // Execute the command
      const result = await executeCommand(command, validWorkingDir);

      // Format output for the agent
      let output = `COMMAND EXECUTION RESULT:\n`;
      output += `Command: ${result.command}\n`;
      output += `Success: ${result.success}\n`;
      output += `Exit Code: ${result.exitCode}\n`;
      output += `Duration: ${result.duration}ms\n\n`;

      if (result.stdout) {
        output += `STDOUT:\n${result.stdout}\n\n`;
      }

      if (result.stderr) {
        output += `STDERR:\n${result.stderr}\n\n`;
      }

      if (result.error) {
        output += `ERROR: ${result.error}\n`;
      }

      console.log(`[CommandExecutor] Completed in ${result.duration}ms`);
      return output;
    } catch (error) {
      const errorDuration = Date.now() - startTime;
      console.error("[CommandExecutor] Critical error:", error.message);

      return JSON.stringify({
        success: false,
        error: `Command execution failed: ${error.message}`,
        duration: errorDuration,
      });
    }
  },
});

// Optional: Create a more restricted version for production
export const safeCommandExecutorTool = new DynamicTool({
  name: "safe_command_executor",
  description:
    "Execute only npm/yarn commands safely. Input is an object or JSON string with 'command' field. Only package manager commands are allowed.",

  func: async (inputJSON) => {
    // Parse input
    let parsedInput = {};
    if (typeof inputJSON === "string") {
      try {
        parsedInput = JSON.parse(inputJSON);
      } catch (parseError) {
        parsedInput = { command: inputJSON };
      }
    } else if (typeof inputJSON === "object" && inputJSON !== null) {
      parsedInput = inputJSON;
    }

    const { command } = parsedInput;

    if (!command) {
      return "Error: Command is required";
    }

    // Only allow specific npm/yarn commands
    const safeCommands = [
      /^npm\s+(install|i)(\s+[\w@\/\-\.]+)*$/,
      /^npm\s+(uninstall|remove|rm)(\s+[\w@\/\-\.]+)*$/,
      /^npm\s+(run|start|test|build|dev)(\s+[\w\-]+)*$/,
      /^npm\s+(list|ls)(\s+.*)?$/,
      /^npm\s+(outdated|audit|update)(\s+.*)?$/,
      /^yarn\s+(add|install|remove)(\s+[\w@\/\-\.]+)*$/,
      /^yarn\s+(run|start|test|build|dev)(\s+[\w\-]+)*$/,
    ];

    const isAllowed = safeCommands.some((pattern) =>
      pattern.test(command.trim())
    );

    if (!isAllowed) {
      return `Error: Command not allowed. Only basic npm/yarn commands are permitted. Command: ${command}`;
    }

    // Use the main executor for allowed commands
    return await commandExecutorTool.func(inputJSON);
  },
});
