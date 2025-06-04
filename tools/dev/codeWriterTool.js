import { DynamicStructuredTool } from "@langchain/core/tools";
import fs from "fs/promises";

export const codeWriterTool = new DynamicStructuredTool({
  name: "code_writer",
  description:
    "Generate or modify code in a specified file. Input: file path, code (string), and writeMode ('overwrite' or 'append').",
  schema: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Path to the code file." },
      code: { type: "string", description: "The code to write or append." },
      writeMode: {
        type: "string",
        enum: ["overwrite", "append"],
        default: "overwrite",
        description: "How to write to the file.",
      },
    },
    required: ["filePath", "code"],
  },
  func: async ({ filePath, code, writeMode = "overwrite" }) => {
    try {
      if (writeMode === "append") {
        await fs.appendFile(filePath, code);
        return `Code appended to ${filePath}`;
      } else {
        await fs.writeFile(filePath, code);
        return `Code written (overwritten) to ${filePath}`;
      }
    } catch (err) {
      return { error: "Failed to write code: " + err.message };
    }
  },
});
