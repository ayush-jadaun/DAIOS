import { DynamicTool } from "@langchain/core/tools";
import fs from "fs/promises";
import path from "path";

export const testGeneratorTool = new DynamicTool({
  name: "test_generator",
  description:
    "Generate and write test cases for a given module/file. Input should be a JSON string or object with 'targetFile', 'testCode', and 'testFilePath' fields.",
  func: async (inputJSON) => {
    console.log("[TEST_GENERATOR] Tool called with input:", inputJSON);

    try {
      let parsedInput;

      // Parse the JSON input
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          const errorMsg = `Failed to parse input JSON: ${parseError.message}. Input was: ${inputJSON}`;
          console.error("[TEST_GENERATOR]", errorMsg);
          return errorMsg;
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        const errorMsg = `Invalid input type. Expected JSON string or object, got: ${typeof inputJSON}`;
        console.error("[TEST_GENERATOR]", errorMsg);
        return errorMsg;
      }

      const { targetFile, testCode, testFilePath } = parsedInput;

      console.log("[TEST_GENERATOR] Parsed input:", {
        targetFile,
        testCodeLength: testCode?.length,
        testFilePath,
      });

      // Validate required fields
      if (!targetFile) {
        const errorMsg = "Missing required field: targetFile";
        console.error("[TEST_GENERATOR]", errorMsg);
        return errorMsg;
      }

      if (testCode === undefined || testCode === null) {
        const errorMsg = "Missing required field: testCode";
        console.error("[TEST_GENERATOR]", errorMsg);
        return errorMsg;
      }

      if (typeof testCode !== "string") {
        const errorMsg = `The 'testCode' field must be a string, got: ${typeof testCode}`;
        console.error("[TEST_GENERATOR]", errorMsg);
        return errorMsg;
      }

      if (!testFilePath) {
        const errorMsg = "Missing required field: testFilePath";
        console.error("[TEST_GENERATOR]", errorMsg);
        return errorMsg;
      }

      // Use sandbox directory consistently
      const sandboxDir = path.join(process.cwd(), "sandbox");
      const absolutePath = path.resolve(sandboxDir, testFilePath);

      // Security check
      if (!absolutePath.startsWith(sandboxDir)) {
        const errorMsg = "Access denied: Path outside of sandbox";
        console.error("[TEST_GENERATOR]", errorMsg);
        return errorMsg;
      }

      console.log("[TEST_GENERATOR] Writing to absolute path:", absolutePath);

      // Ensure directory exists
      const dir = path.dirname(absolutePath);
      console.log("[TEST_GENERATOR] Ensuring directory exists:", dir);
      await fs.mkdir(dir, { recursive: true });

      // Write the test code
      let resultMessage;
      await fs.writeFile(absolutePath, testCode, "utf8");
      resultMessage = `Test file generated at ${testFilePath} for ${targetFile}`;

      // Verify the file was created/modified
      try {
        const stats = await fs.stat(absolutePath);
        console.log(
          "[TEST_GENERATOR] File verified - size:",
          stats.size,
          "bytes"
        );

        // Read back a sample of the content to verify
        const writtenContent = await fs.readFile(absolutePath, "utf8");
        console.log(
          "[TEST_GENERATOR] File content preview:",
          writtenContent.substring(0, 50) + "..."
        );

        resultMessage += `. File size: ${stats.size} bytes. Content verified.`;
      } catch (statError) {
        console.error("[TEST_GENERATOR] Failed to verify file:", statError);
        resultMessage += " Warning: Could not verify file was created.";
      }

      console.log("[TEST_GENERATOR] Success - returning:", resultMessage);
      return resultMessage;
    } catch (err) {
      const errorMsg = `Failed to write test file: ${err.message}`;
      console.error("[TEST_GENERATOR] Error:", errorMsg);
      console.error("[TEST_GENERATOR] Stack:", err.stack);
      return errorMsg;
    }
  },
});
