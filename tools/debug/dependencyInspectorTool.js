import { DynamicTool } from "@langchain/core/tools";
import fs from "fs/promises";
import path from "path";

export const dependencyInspectorTool = new DynamicTool({
  name: "dependency_inspector",
  description:
    "Read and parse package.json or requirements.txt to list dependencies. Input is a JSON object with 'filePath'. Returns { dependencies, fileType, filePath, raw }. For errors, returns { error }.",
  func: async (inputJSON) => {
    try {
      let parsedInput = {};
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch {
          return { error: "Input string could not be parsed as JSON." };
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      }

      const filePath = parsedInput.filePath;
      if (!filePath) return { error: "Missing required field: filePath" };

      const sandboxDir = path.join(process.cwd(), "sandbox");
      const absolutePath = path.resolve(sandboxDir, filePath);
      if (!absolutePath.startsWith(sandboxDir))
        return { error: "Access denied: Path outside of sandbox" };

      const content = await fs.readFile(absolutePath, "utf-8");

      if (filePath.endsWith("package.json")) {
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch {
          return { error: "package.json could not be parsed as JSON." };
        }
        return {
          dependencies: parsed.dependencies || {},
          devDependencies: parsed.devDependencies || {},
          fileType: "package.json",
          filePath,
          raw: content,
        };
      } else if (filePath.endsWith("requirements.txt")) {
        const dependencies = content
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        return {
          dependencies,
          fileType: "requirements.txt",
          filePath,
          raw: content,
        };
      } else {
        return { error: "Unsupported file type for dependency inspection." };
      }
    } catch (err) {
      return { error: "Failed to read dependency file: " + err.message };
    }
  },
});
