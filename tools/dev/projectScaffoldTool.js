import { DynamicTool } from "@langchain/core/tools";
import fs from "fs/promises";
import path from "path";

export const projectScaffoldTool = new DynamicTool({
  name: "project_scaffold",
  description:
    "Scaffold a new project structure. Input should be an object or JSON string with 'rootDir' and 'structure' (an array of files/folders with optional content).",
  func: async (inputJSON) => {
    console.log("[PROJECT_SCAFFOLD] Tool called with input:", inputJSON);

    try {
      let parsedInput;

      // Parse the JSON input
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          const errorMsg = `Failed to parse input JSON: ${parseError.message}. Input was: ${inputJSON}`;
          console.error("[PROJECT_SCAFFOLD]", errorMsg);
          return errorMsg;
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        const errorMsg = `Invalid input type. Expected JSON string or object, got: ${typeof inputJSON}`;
        console.error("[PROJECT_SCAFFOLD]", errorMsg);
        return errorMsg;
      }

      const { rootDir, structure } = parsedInput;

      // Validate fields
      if (!rootDir) {
        const errorMsg = "Missing required field: rootDir";
        console.error("[PROJECT_SCAFFOLD]", errorMsg);
        return errorMsg;
      }
      if (!Array.isArray(structure) || structure.length === 0) {
        const errorMsg =
          "Missing or invalid required field: structure (must be a non-empty array)";
        console.error("[PROJECT_SCAFFOLD]", errorMsg);
        return errorMsg;
      }

      // Use sandbox directory for safety
      const sandboxDir = path.join(process.cwd(), "sandbox");
      const absRoot = path.resolve(sandboxDir, rootDir);

      // Security check
      if (!absRoot.startsWith(sandboxDir)) {
        const errorMsg =
          "Access denied: Root directory is outside the sandbox.";
        console.error("[PROJECT_SCAFFOLD]", errorMsg);
        return errorMsg;
      }

      // Create structure
      for (const item of structure) {
        if (!item.path || !item.type) {
          const errorMsg =
            "Each item in structure must have 'path' and 'type'.";
          console.error("[PROJECT_SCAFFOLD]", errorMsg);
          return errorMsg;
        }

        const absPath = path.resolve(absRoot, item.path);

        if (!absPath.startsWith(absRoot)) {
          const errorMsg = `Access denied: Path ${absPath} is outside rootDir.`;
          console.error("[PROJECT_SCAFFOLD]", errorMsg);
          return errorMsg;
        }

        if (item.type === "folder") {
          await fs.mkdir(absPath, { recursive: true });
        } else if (item.type === "file") {
          await fs.mkdir(path.dirname(absPath), { recursive: true });
          await fs.writeFile(absPath, item.content || "");
        } else {
          const errorMsg = `Unknown type "${item.type}" for path "${item.path}".`;
          console.error("[PROJECT_SCAFFOLD]", errorMsg);
          return errorMsg;
        }
      }

      console.log("[PROJECT_SCAFFOLD] Project scaffold created at:", absRoot);
      return `Project scaffold created at ${absRoot}`;
    } catch (err) {
      const errorMsg = `Failed to scaffold project: ${err.message}`;
      console.error("[PROJECT_SCAFFOLD] Error:", errorMsg);
      console.error("[PROJECT_SCAFFOLD] Stack:", err.stack);
      return errorMsg;
    }
  },
});
