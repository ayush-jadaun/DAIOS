import { DynamicStructuredTool } from "@langchain/core/tools";
import fs from "fs/promises";
import path from "path";

export const projectScaffoldTool = new DynamicStructuredTool({
  name: "project_scaffold",
  description:
    "Scaffold a new project structure. Input: root directory and a list of file/folder paths to create, with optional file contents.",
  schema: {
    type: "object",
    properties: {
      rootDir: {
        type: "string",
        description: "Root directory for the new project.",
      },
      structure: {
        type: "array",
        description: "Array of objects describing files/folders to create.",
        items: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Relative path from rootDir.",
            },
            type: {
              type: "string",
              enum: ["file", "folder"],
              description: "file or folder.",
            },
            content: {
              type: "string",
              description: "File content (if type is file).",
              default: "",
            },
          },
          required: ["path", "type"],
        },
      },
    },
    required: ["rootDir", "structure"],
  },
  func: async ({ rootDir, structure }) => {
    try {
      for (const item of structure) {
        const absPath = path.join(rootDir, item.path);
        if (item.type === "folder") {
          await fs.mkdir(absPath, { recursive: true });
        } else {
          await fs.mkdir(path.dirname(absPath), { recursive: true });
          await fs.writeFile(absPath, item.content || "");
        }
      }
      return `Project scaffold created at ${rootDir}`;
    } catch (err) {
      return { error: "Failed to scaffold project: " + err.message };
    }
  },
});
