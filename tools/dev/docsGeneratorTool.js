import { DynamicTool } from "@langchain/core/tools";
import fs from "fs/promises";
import path from "path";

export const docsGeneratorTool = new DynamicTool({
  name: "docs_generator",
  description:
    "Generate or update documentation for code. Input should be a JSON string or object with 'filePath', 'docs', and optional 'writeMode' fields. 'filePath' is the documentation file (e.g. README.md), 'docs' is the documentation content (string), and 'writeMode' is 'overwrite' or 'append' (default 'overwrite').",
  func: async (inputJSON) => {
    console.log("[DOCS_GENERATOR] Tool called with input:", inputJSON);

    try {
      let parsedInput;

      // Parse the JSON input
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          const errorMsg = `Failed to parse input JSON: ${parseError.message}. Input was: ${inputJSON}`;
          console.error("[DOCS_GENERATOR]", errorMsg);
          return errorMsg;
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        const errorMsg = `Invalid input type. Expected JSON string or object, got: ${typeof inputJSON}`;
        console.error("[DOCS_GENERATOR]", errorMsg);
        return errorMsg;
      }

      const { filePath, docs, writeMode = "overwrite" } = parsedInput;

      console.log("[DOCS_GENERATOR] Parsed input:", {
        filePath,
        docsLength: docs?.length,
        writeMode,
      });

      // Validate required fields
      if (!filePath) {
        const errorMsg = "Missing required field: filePath";
        console.error("[DOCS_GENERATOR]", errorMsg);
        return errorMsg;
      }

      if (docs === undefined || docs === null) {
        const errorMsg = "Missing required field: docs";
        console.error("[DOCS_GENERATOR]", errorMsg);
        return errorMsg;
      }

      if (typeof docs !== "string") {
        const errorMsg = `The 'docs' field must be a string, got: ${typeof docs}`;
        console.error("[DOCS_GENERATOR]", errorMsg);
        return errorMsg;
      }

      if (!["overwrite", "append"].includes(writeMode)) {
        const errorMsg = `Invalid writeMode: ${writeMode}. Must be 'overwrite' or 'append'`;
        console.error("[DOCS_GENERATOR]", errorMsg);
        return errorMsg;
      }

      // Use sandbox directory consistently
      const sandboxDir = path.join(process.cwd(), "sandbox");
      const absolutePath = path.resolve(sandboxDir, filePath);

      // Security check
      if (!absolutePath.startsWith(sandboxDir)) {
        const errorMsg = "Access denied: Path outside of sandbox";
        console.error("[DOCS_GENERATOR]", errorMsg);
        return errorMsg;
      }

      console.log("[DOCS_GENERATOR] Writing to absolute path:", absolutePath);

      // Ensure directory exists
      const dir = path.dirname(absolutePath);
      console.log("[DOCS_GENERATOR] Ensuring directory exists:", dir);
      await fs.mkdir(dir, { recursive: true });

      // Write or append the docs
      let resultMessage;
      if (writeMode === "append") {
        console.log("[DOCS_GENERATOR] Appending docs to file...");
        await fs.appendFile(absolutePath, docs, "utf8");
        resultMessage = `Docs appended successfully to ${filePath}`;
      } else {
        console.log("[DOCS_GENERATOR] Writing docs to file...");
        await fs.writeFile(absolutePath, docs, "utf8");
        resultMessage = `Docs written successfully to ${filePath}`;
      }

      // Verify the file was created/modified
      try {
        const stats = await fs.stat(absolutePath);
        console.log(
          "[DOCS_GENERATOR] File verified - size:",
          stats.size,
          "bytes"
        );

        // Read back a sample of the content to verify
        const writtenContent = await fs.readFile(absolutePath, "utf8");
        console.log(
          "[DOCS_GENERATOR] File content preview:",
          writtenContent.substring(0, 50) + "..."
        );

        resultMessage += `. File size: ${stats.size} bytes. Content verified.`;
      } catch (statError) {
        console.error("[DOCS_GENERATOR] Failed to verify file:", statError);
        resultMessage += " Warning: Could not verify file was created.";
      }

      console.log("[DOCS_GENERATOR] Success - returning:", resultMessage);
      return resultMessage;
    } catch (err) {
      const errorMsg = `Failed to write docs: ${err.message}`;
      console.error("[DOCS_GENERATOR] Error:", errorMsg);
      console.error("[DOCS_GENERATOR] Stack:", err.stack);
      return errorMsg;
    }
  },
});
