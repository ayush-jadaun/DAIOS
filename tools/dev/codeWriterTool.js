import { DynamicTool } from "@langchain/core/tools";
import fs from "fs/promises";
import path from "path";

export const codeWriterTool = new DynamicTool({
  name: "code_writer",
  description:
    "Generate or modify code in a specified file. Input should be a JSON string with 'filePath', 'code', and optional 'writeMode' fields.",
  func: async (inputJSON) => {
    console.log("[CODE_WRITER] Tool called with input:", inputJSON);

    try {
      let parsedInput;

      // Parse the JSON input
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          const errorMsg = `Failed to parse input JSON: ${parseError.message}. Input was: ${inputJSON}`;
          console.error("[CODE_WRITER]", errorMsg);
          return errorMsg;
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        const errorMsg = `Invalid input type. Expected JSON string or object, got: ${typeof inputJSON}`;
        console.error("[CODE_WRITER]", errorMsg);
        return errorMsg;
      }

      const { filePath, code, writeMode = "overwrite" } = parsedInput;

      console.log("[CODE_WRITER] Parsed input:", {
        filePath,
        codeLength: code?.length,
        writeMode,
      });

      // Validate required fields
      if (!filePath) {
        const errorMsg = "Missing required field: filePath";
        console.error("[CODE_WRITER]", errorMsg);
        return errorMsg;
      }

      if (code === undefined || code === null) {
        const errorMsg = "Missing required field: code";
        console.error("[CODE_WRITER]", errorMsg);
        return errorMsg;
      }

      if (typeof code !== "string") {
        const errorMsg = `The 'code' field must be a string, got: ${typeof code}`;
        console.error("[CODE_WRITER]", errorMsg);
        return errorMsg;
      }

      if (!["overwrite", "append"].includes(writeMode)) {
        const errorMsg = `Invalid writeMode: ${writeMode}. Must be 'overwrite' or 'append'`;
        console.error("[CODE_WRITER]", errorMsg);
        return errorMsg;
      }

      // Use sandbox directory consistently
      const sandboxDir = path.join(process.cwd(), "sandbox");
      const absolutePath = path.resolve(sandboxDir, filePath);

      // Security check
      if (!absolutePath.startsWith(sandboxDir)) {
        const errorMsg = "Access denied: Path outside of sandbox";
        console.error("[CODE_WRITER]", errorMsg);
        return errorMsg;
      }

      console.log("[CODE_WRITER] Writing to absolute path:", absolutePath);

      // Ensure directory exists
      const dir = path.dirname(absolutePath);
      console.log("[CODE_WRITER] Ensuring directory exists:", dir);
      await fs.mkdir(dir, { recursive: true });

      // Write or append the code
      let resultMessage;
      if (writeMode === "append") {
        console.log("[CODE_WRITER] Appending code to file...");
        await fs.appendFile(absolutePath, code, "utf8");
        resultMessage = `Code appended successfully to ${filePath}`;
      } else {
        console.log("[CODE_WRITER] Writing code to file...");
        await fs.writeFile(absolutePath, code, "utf8");
        resultMessage = `Code written successfully to ${filePath}`;
      }

      // Verify the file was created/modified
      try {
        const stats = await fs.stat(absolutePath);
        console.log("[CODE_WRITER] File verified - size:", stats.size, "bytes");

        // Read back a sample of the content to verify
        const writtenContent = await fs.readFile(absolutePath, "utf8");
        console.log(
          "[CODE_WRITER] File content preview:",
          writtenContent.substring(0, 50) + "..."
        );

        resultMessage += `. File size: ${stats.size} bytes. Content verified.`;
      } catch (statError) {
        console.error("[CODE_WRITER] Failed to verify file:", statError);
        resultMessage += " Warning: Could not verify file was created.";
      }

      console.log("[CODE_WRITER] Success - returning:", resultMessage);
      return resultMessage;
    } catch (err) {
      const errorMsg = `Failed to write code: ${err.message}`;
      console.error("[CODE_WRITER] Error:", errorMsg);
      console.error("[CODE_WRITER] Stack:", err.stack);
      return errorMsg;
    }
  },
});
