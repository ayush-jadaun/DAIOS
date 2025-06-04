import { DynamicStructuredTool } from "@langchain/core/tools";
import fs from "fs/promises";

export const testGeneratorTool = new DynamicStructuredTool({
  name: "test_generator",
  description:
    "Generate and write test cases for a given module/file. Input: target file path, test code (string), and test file path.",
  schema: {
    type: "object",
    properties: {
      targetFile: {
        type: "string",
        description: "Path to the file/module to generate tests for.",
      },
      testCode: { type: "string", description: "Test code to write." },
      testFilePath: {
        type: "string",
        description: "Path to write the generated test file.",
      },
    },
    required: ["targetFile", "testCode", "testFilePath"],
  },
  func: async ({ targetFile, testCode, testFilePath }) => {
    try {
      await fs.writeFile(testFilePath, testCode);
      return `Test file generated at ${testFilePath} for ${targetFile}`;
    } catch (err) {
      return { error: "Failed to write test file: " + err.message };
    }
  },
});
