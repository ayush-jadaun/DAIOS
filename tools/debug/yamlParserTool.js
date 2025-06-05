import { DynamicTool } from "@langchain/core/tools";
import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";

export const yamlParserTool = new DynamicTool({
  name: "yaml_parser",
  description:
    "Parse a YAML file and return its contents as JSON. If the file does not exist, create an empty YAML file and return an empty object. Input should be an object or JSON string with the field 'filePath' (string). The output includes both the parsed JSON and the raw YAML content.",
  func: async (inputJSON) => {
    console.log("[YAML_PARSER] Tool called with input:", inputJSON);

    try {
      let parsedInput;

      // Parse JSON input
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          const errorMsg = `Failed to parse input JSON: ${parseError.message}. Input was: ${inputJSON}`;
          console.error("[YAML_PARSER]", errorMsg);
          return JSON.stringify({ error: errorMsg });
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        const errorMsg = `Invalid input type. Expected JSON string or object, got: ${typeof inputJSON}`;
        console.error("[YAML_PARSER]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }

      const { filePath } = parsedInput;

      // Validate required field
      if (!filePath || typeof filePath !== "string") {
        const errorMsg = "Missing or invalid required field: filePath";
        console.error("[YAML_PARSER]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }

      // Use sandbox directory for file safety
      const sandboxDir = path.join(process.cwd(), "sandbox");
      const absolutePath = path.resolve(sandboxDir, filePath);

      // Security check
      if (!absolutePath.startsWith(sandboxDir)) {
        const errorMsg = "Access denied: Path outside of sandbox";
        console.error("[YAML_PARSER]", errorMsg);
        return JSON.stringify({ error: errorMsg });
      }

      // Read and parse YAML file, create if it doesn't exist
      let content;
      try {
        content = await fs.readFile(absolutePath, "utf-8");
      } catch (readErr) {
        if (readErr.code === "ENOENT") {
          // File does not exist: create an empty YAML file and return empty object
          try {
            await fs.mkdir(path.dirname(absolutePath), { recursive: true });
            await fs.writeFile(absolutePath, "");
            console.log(
              `[YAML_PARSER] File ${absolutePath} did not exist. Created empty YAML file.`
            );

            const result = {
              success: true,
              message: `File ${filePath} did not exist. Created empty YAML file.`,
              parsed: {},
              raw: "",
              summary: "Empty YAML file created",
            };

            return JSON.stringify(result);
          } catch (createErr) {
            const errorMsg = `Failed to create missing YAML file: ${createErr.message}`;
            console.error("[YAML_PARSER]", errorMsg);
            return JSON.stringify({ error: errorMsg });
          }
        } else {
          const errorMsg = `Failed to read YAML file: ${readErr.message}`;
          console.error("[YAML_PARSER]", errorMsg);
          return JSON.stringify({ error: errorMsg });
        }
      }

      try {
        const parsedYaml = yaml.load(content);
        console.log("[YAML_PARSER] Successfully parsed YAML.");

        // Create a comprehensive response
        const result = {
          success: true,
          message: `Successfully parsed YAML file: ${filePath}`,
          parsed: parsedYaml || {},
          raw: content,
          summary: generateYamlSummary(parsedYaml),
          stats: {
            fileSize: content.length,
            lines: content.split("\n").length,
            keys:
              parsedYaml && typeof parsedYaml === "object"
                ? Object.keys(parsedYaml).length
                : 0,
          },
        };

        return JSON.stringify(result);
      } catch (parseErr) {
        const errorMsg = `Failed to parse YAML file: ${parseErr.message}`;
        console.error("[YAML_PARSER]", errorMsg);
        return JSON.stringify({
          error: errorMsg,
          raw: content,
          message: `YAML parsing failed for ${filePath}`,
        });
      }
    } catch (err) {
      const errorMsg = `YAML parser tool error: ${err.message}`;
      console.error("[YAML_PARSER] Error:", errorMsg);
      console.error("[YAML_PARSER] Stack:", err.stack);
      return JSON.stringify({ error: errorMsg });
    }
  },
});

// Helper function to generate a human-readable summary of YAML content
function generateYamlSummary(parsedYaml) {
  if (!parsedYaml || typeof parsedYaml !== "object") {
    return "Simple value or empty content";
  }

  const keys = Object.keys(parsedYaml);
  if (keys.length === 0) {
    return "Empty object";
  }

  const summaryParts = [];

  // Analyze the structure
  if (keys.includes("name")) summaryParts.push(`name: ${parsedYaml.name}`);
  if (keys.includes("version"))
    summaryParts.push(`version: ${parsedYaml.version}`);
  if (keys.includes("description")) summaryParts.push(`description provided`);

  // Count different types of values
  const objectKeys = keys.filter(
    (key) => typeof parsedYaml[key] === "object" && parsedYaml[key] !== null
  );
  const arrayKeys = keys.filter((key) => Array.isArray(parsedYaml[key]));

  if (objectKeys.length > 0) {
    summaryParts.push(
      `${objectKeys.length} nested object(s): ${objectKeys.join(", ")}`
    );
  }

  if (arrayKeys.length > 0) {
    summaryParts.push(`${arrayKeys.length} array(s): ${arrayKeys.join(", ")}`);
  }

  return summaryParts.length > 0
    ? summaryParts.join("; ")
    : `${keys.length} properties: ${keys.join(", ")}`;
}

