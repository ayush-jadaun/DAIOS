import { DynamicTool } from "@langchain/core/tools";
import FileTool from "./fileTool.js";
import path from "path";

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
  func: async (input) => {
    try {
      console.log("[writeFileTool] Raw input:", input);
      console.log("[writeFileTool] Input type:", typeof input);

      let parsedInput;

      // Handle both JSON string and object inputs
      if (typeof input === "string") {
        parsedInput = JSON.parse(input);
      } else if (typeof input === "object" && input !== null) {
        parsedInput = input;
      } else {
        throw new Error("Invalid input format");
      }

      const { filePath, contents } = parsedInput;

      if (!filePath) {
        throw new Error("filePath is required");
      }

      // Handle undefined contents
      const safeContents = contents ?? "";

      console.log(`[writeFileTool] Writing to: ${filePath}`);
      console.log(`[writeFileTool] Contents length: ${safeContents.length}`);

      const result = await fileTool.write(filePath, safeContents);
      return result;
    } catch (error) {
      console.error("[writeFileTool] Error:", error);
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

export const appendFileTool = new DynamicTool({
  name: "appendFile",
  description:
    "Appends content to the end of a file in the sandbox directory. Input should be a JSON string with 'filePath' and 'contents' fields.",
  func: async (inputJSON) => {
    try {
      const { filePath, contents } = JSON.parse(inputJSON);
      const result = await fileTool.append(filePath, contents);
      return result;
    } catch (error) {
      return `Error appending file: ${error.message}`;
    }
  },
});

export const deleteFileTool = new DynamicTool({
  name: "deleteFile",
  description:
    "Deletes a file in the sandbox directory. Input should be a JSON string with a 'filePath' field.",
  func: async (inputJSON) => {
    try {
      const { filePath } = JSON.parse(inputJSON);
      const result = await fileTool.delete(filePath);
      return result;
    } catch (error) {
      return `Error deleting file: ${error.message}`;
    }
  },
});

export const moveFileTool = new DynamicTool({
  name: "moveFile",
  description:
    "Moves (renames) a file in the sandbox directory. Input should be a JSON string with 'srcPath' and 'destPath' fields.",
  func: async (inputJSON) => {
    try {
      const { srcPath, destPath } = JSON.parse(inputJSON);
      const result = await fileTool.move(srcPath, destPath);
      return result;
    } catch (error) {
      return `Error moving file: ${error.message}`;
    }
  },
});

export const copyFileTool = new DynamicTool({
  name: "copyFile",
  description:
    "Copies a file in the sandbox directory. Input should be a JSON string with 'srcPath' and 'destPath' fields.",
  func: async (inputJSON) => {
    try {
      const { srcPath, destPath } = JSON.parse(inputJSON);
      const result = await fileTool.copy(srcPath, destPath);
      return result;
    } catch (error) {
      return `Error copying file: ${error.message}`;
    }
  },
});

