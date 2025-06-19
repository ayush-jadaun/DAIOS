import { DynamicTool } from "@langchain/core/tools";
import fs from "fs/promises";
import path from "path";

export const ciConfigTool = new DynamicTool({
  name: "ci_config_tool",
  description:
    "Generate or update CI/CD configuration files (e.g. GitHub Actions, GitLab CI). Input should be an object or JSON string with 'filePath' and 'config' (YAML or JSON as string), and optional 'writeMode' ('overwrite' or 'append', default 'overwrite').",
  func: async (inputJSON) => {
    console.log("[CI_CONFIG_TOOL] Tool called with input:", inputJSON);

    try {
      let parsedInput;

      // Parse the JSON input
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          const errorMsg = `Failed to parse input JSON: ${parseError.message}. Input was: ${inputJSON}`;
          console.error("[CI_CONFIG_TOOL]", errorMsg);
          return errorMsg;
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        const errorMsg = `Invalid input type. Expected JSON string or object, got: ${typeof inputJSON}`;
        console.error("[CI_CONFIG_TOOL]", errorMsg);
        return errorMsg;
      }

      const { filePath, config, writeMode = "overwrite" } = parsedInput;

      // Validate required fields
      if (!filePath) {
        const errorMsg = "Missing required field: filePath";
        console.error("[CI_CONFIG_TOOL]", errorMsg);
        return errorMsg;
      }

      if (config === undefined || config === null) {
        const errorMsg = "Missing required field: config";
        console.error("[CI_CONFIG_TOOL]", errorMsg);
        return errorMsg;
      }

      if (typeof config !== "string") {
        const errorMsg = `The 'config' field must be a string, got: ${typeof config}`;
        console.error("[CI_CONFIG_TOOL]", errorMsg);
        return errorMsg;
      }

      if (!["overwrite", "append"].includes(writeMode)) {
        const errorMsg = `Invalid writeMode: ${writeMode}. Must be 'overwrite' or 'append'`;
        console.error("[CI_CONFIG_TOOL]", errorMsg);
        return errorMsg;
      }

      // Use sandbox directory for file safety
      const sandboxDir = path.join(process.cwd(), "sandbox");
      const absolutePath = path.resolve(sandboxDir, filePath);

      // Security check
      if (!absolutePath.startsWith(sandboxDir)) {
        const errorMsg = "Access denied: Path outside of sandbox";
        console.error("[CI_CONFIG_TOOL]", errorMsg);
        return errorMsg;
      }

      console.log("[CI_CONFIG_TOOL] Writing to absolute path:", absolutePath);

      // Ensure directory exists
      const dir = path.dirname(absolutePath);
      console.log("[CI_CONFIG_TOOL] Ensuring directory exists:", dir);
      await fs.mkdir(dir, { recursive: true });

      // Write or append the config
      let resultMessage;
      if (writeMode === "append") {
        console.log("[CI_CONFIG_TOOL] Appending CI config to file...");
        await fs.appendFile(absolutePath, config, "utf8");
        resultMessage = `CI config appended to ${filePath}`;
      } else {
        console.log("[CI_CONFIG_TOOL] Writing CI config to file...");
        await fs.writeFile(absolutePath, config, "utf8");
        resultMessage = `CI config written (overwritten) to ${filePath}`;
      }

      // Verify the file was created/modified
      try {
        const stats = await fs.stat(absolutePath);
        console.log(
          "[CI_CONFIG_TOOL] File verified - size:",
          stats.size,
          "bytes"
        );

        // Read back a sample of the content to verify
        const writtenContent = await fs.readFile(absolutePath, "utf8");
        console.log(
          "[CI_CONFIG_TOOL] File content preview:",
          writtenContent.substring(0, 50) + "..."
        );

        resultMessage += `. File size: ${stats.size} bytes. Content verified.`;
      } catch (statError) {
        console.error("[CI_CONFIG_TOOL] Failed to verify file:", statError);
        resultMessage += " Warning: Could not verify file was created.";
      }

      console.log("[CI_CONFIG_TOOL] Success - returning:", resultMessage);
      return resultMessage;
    } catch (err) {
      const errorMsg = `Failed to write CI config: ${err.message}`;
      console.error("[CI_CONFIG_TOOL] Error:", errorMsg);
      console.error("[CI_CONFIG_TOOL] Stack:", err.stack);
      return errorMsg;
    }
  },
});
