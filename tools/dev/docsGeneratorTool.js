import { DynamicStructuredTool } from "@langchain/core/tools";
import fs from "fs/promises";

export const docsGeneratorTool = new DynamicStructuredTool({
  name: "docs_generator",
  description:
    "Generate or update documentation for code. Input: file path and documentation content (string).",
  schema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Path to the documentation file (e.g. README.md).",
      },
      docs: { type: "string", description: "Documentation content to write." },
      writeMode: {
        type: "string",
        enum: ["overwrite", "append"],
        default: "overwrite",
        description: "How to write to the file.",
      },
    },
    required: ["filePath", "docs"],
  },
  func: async ({ filePath, docs, writeMode = "overwrite" }) => {
    try {
      if (writeMode === "append") {
        await fs.appendFile(filePath, docs);
        return `Docs appended to ${filePath}`;
      } else {
        await fs.writeFile(filePath, docs);
        return `Docs written (overwritten) to ${filePath}`;
      }
    } catch (err) {
      return { error: "Failed to write docs: " + err.message };
    }
  },
});
