import { DynamicTool } from "@langchain/core/tools";
import FileTool from "./fileTool.js";
import path from "path"

const fileTool = new FileTool(path.join(process.cwd(), "sandbox"));

export const readFileTool = new DynamicTool({
  name: "readFile",
  description:
    "Reads a file from the sandbox directory. Input should be a JSON string with a 'filePath' field.",
  func: async (inputJSON) => {
    try {
      const { filePath } = JSON.parse(inputJSON);
      const content = await fileTool.read(filePath);
      return content;
    } catch (error) {
      return `Error reading file: ${error.message}`;
    }
  },
});

export const writeFileTool = new DynamicTool({
  name: "writeFile",
  description:
    "Writes content to a file in the sandbox directory. Input should be a JSON string with 'filePath' and 'contents' fields.",
  func: async (inputJSON) => {
    try {
      const { filePath, contents } = JSON.parse(inputJSON);

      // Defensive fix: strip wrapping quotes if present
      let safeContents = contents;
      if (
        typeof safeContents === "string" &&
        safeContents.length > 1 &&
        ((safeContents.startsWith('"') && safeContents.endsWith('"')) ||
          (safeContents.startsWith("'") && safeContents.endsWith("'")))
      ) {
        safeContents = safeContents.slice(1, -1);
      }

      // Log what will actually be written
      console.log(`[writeFileTool] Writing to: ${filePath}`);
      console.log(`[writeFileTool] Contents:`, JSON.stringify(safeContents));

      const result = await fileTool.write(filePath, safeContents);
      return result;
    } catch (error) {
      return `Error writing file: ${error.message}`;
    }
  },
});

export const listFilesTool = new DynamicTool({
  name: "listFiles",
  description:
    "Lists files in a directory within the sandbox. Input should be a JSON string with a 'dirPath' field (optional, defaults to current directory).",
  func: async (inputJSON) => {
    try {
      const parsed = JSON.parse(inputJSON);
      const dirPath = parsed.dirPath || ".";
      const files = await fileTool.list(dirPath);
      return `Files in ${dirPath}: ${files.join(", ")}`;
    } catch (error) {
      return `Error listing files: ${error.message}`;
    }
  },
});

// Debug export to verify tools are created properly
console.log("File tools created:");
console.log("readFileTool:", { name: readFileTool.name });
console.log("writeFileTool:", { name: writeFileTool.name });
console.log("listFilesTool:", { name: listFilesTool.name });
