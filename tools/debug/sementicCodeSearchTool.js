import { DynamicStructuredTool } from "@langchain/core/tools";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { glob } from "glob";

const CHROMA_BRIDGE_URL =
  process.env.CHROMA_BRIDGE_URL || "http://chroma-service:8001";
const CHROMA_COLLECTION_NAME = process.env.CHROMA_CODE_COLLECTION || "codebase";
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();

// File extensions to search through
const CODE_EXTENSIONS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".java",
  ".cpp",
  ".c",
  ".h",
  ".cs",
  ".php",
  ".rb",
  ".go",
  ".rs",
  ".swift",
  ".kt",
  ".scala",
  ".vue",
  ".svelte",
  ".html",
  ".css",
  ".scss",
  ".less",
  ".json",
  ".yml",
  ".yaml",
  ".xml",
  ".md",
  ".txt",
  ".sh",
  ".bat",
  ".sql",
];

// Directories to exclude from search
const EXCLUDE_DIRS = [
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  "dist",
  "build",
  ".cache",
  ".tmp",
  "tmp",
  "logs",
  "coverage",
  ".nyc_output",
  ".vscode",
  ".idea",
  "__pycache__",
  ".pytest_cache",
  "vendor",
];

// Input validation and sanitization
function validateAndSanitizeQuery(query) {
  if (!query || typeof query !== "string") {
    throw new Error("Query must be a non-empty string");
  }

  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new Error("Query cannot be empty");
  }

  if (trimmed.length > 1000) {
    throw new Error("Query is too long (max 1000 characters)");
  }

  // Remove potentially dangerous characters but keep most punctuation for code search
  const sanitized = trimmed.replace(/[<>{}]/g, "");
  return sanitized;
}

function validateTopK(topK) {
  const parsed = parseInt(topK) || 3;
  return Math.max(1, Math.min(20, parsed));
}

function formatRelevanceScore(distance) {
  if (typeof distance !== "number") return "N/A";
  const clampedDistance = Math.max(0, Math.min(2, distance));
  const relevance = (1 - clampedDistance) * 100;
  return relevance > 0 ? relevance.toFixed(1) : "0.0";
}

function truncateContent(content, maxLength = 2000) {
  if (!content || content.length <= maxLength) return content;
  return content.substring(0, maxLength) + "\n... [truncated]";
}

// File system search functions
async function findFilesInProject() {
  try {
    const pattern = `**/*{${CODE_EXTENSIONS.join(",")}}`;
    const ignore = EXCLUDE_DIRS.map((dir) => `**/${dir}/**`);

    const files = await glob(pattern, {
      cwd: PROJECT_ROOT,
      ignore: ignore,
      absolute: true,
      maxDepth: 10, // Prevent infinite recursion
    });

    return files;
  } catch (error) {
    console.error("[FileSystemSearch] Error finding files:", error.message);
    return [];
  }
}

async function searchInFile(filePath, query, isRegex = false) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const matches = [];

    const searchTerm = isRegex ? new RegExp(query, "gi") : query.toLowerCase();

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      let isMatch = false;

      if (isRegex && searchTerm instanceof RegExp) {
        isMatch = searchTerm.test(line);
      } else {
        isMatch = line.toLowerCase().includes(searchTerm);
      }

      if (isMatch) {
        // Get context lines around the match
        const contextStart = Math.max(0, index - 2);
        const contextEnd = Math.min(lines.length - 1, index + 2);
        const contextLines = lines.slice(contextStart, contextEnd + 1);

        matches.push({
          lineNumber,
          line: line.trim(),
          context: contextLines.join("\n"),
          contextStart: contextStart + 1,
          contextEnd: contextEnd + 1,
        });
      }
    });

    return matches;
  } catch (error) {
    console.error(
      `[FileSystemSearch] Error reading file ${filePath}:`,
      error.message
    );
    return [];
  }
}

async function fileSystemSearch(query, topK) {
  console.log(`[FileSystemSearch] Searching for "${query}" in project files`);

  const startTime = Date.now();
  const files = await findFilesInProject();

  console.log(`[FileSystemSearch] Found ${files.length} files to search`);

  const allMatches = [];

  // Search in batches to avoid overwhelming the system
  const batchSize = 50;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    const batchPromises = batch.map(async (filePath) => {
      const matches = await searchInFile(filePath, query);
      return matches.map((match) => ({
        ...match,
        file: path.relative(PROJECT_ROOT, filePath),
        fullPath: filePath,
      }));
    });

    const batchResults = await Promise.all(batchPromises);
    allMatches.push(...batchResults.flat());
  }

  // Sort by relevance (number of matches per file, then alphabetically)
  const fileMatchCounts = {};
  allMatches.forEach((match) => {
    fileMatchCounts[match.file] = (fileMatchCounts[match.file] || 0) + 1;
  });

  allMatches.sort((a, b) => {
    const countDiff = fileMatchCounts[b.file] - fileMatchCounts[a.file];
    if (countDiff !== 0) return countDiff;
    return a.file.localeCompare(b.file);
  });

  const searchTime = Date.now() - startTime;
  console.log(
    `[FileSystemSearch] Found ${allMatches.length} matches in ${searchTime}ms`
  );

  return allMatches.slice(0, topK);
}

// Vector search function (existing functionality)
async function vectorSearch(query, topK) {
  console.log(`[VectorSearch] Searching: "${query}" (top ${topK})`);

  const requestPayload = {
    collection: CHROMA_COLLECTION_NAME,
    query_texts: [query],
    n_results: topK,
    include: ["documents", "metadatas", "distances"],
  };

  const response = await axios.post(
    `${CHROMA_BRIDGE_URL}/query`,
    requestPayload,
    {
      timeout: 30000,
      maxContentLength: 50 * 1024 * 1024,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "daios-semantic-search/1.0",
      },
      validateStatus: (status) => status < 500,
    }
  );

  if (response.status === 404) {
    throw new Error(`Collection "${CHROMA_COLLECTION_NAME}" not found`);
  }

  if (response.status >= 400) {
    throw new Error(
      `Semantic search service error (${response.status}): ${
        response.data?.message || response.data?.error || "Unknown error"
      }`
    );
  }

  const documents = response.data.documents?.[0] || [];
  const metadatas = response.data.metadatas?.[0] || [];
  const distances = response.data.distances?.[0] || [];

  return documents.map((doc, index) => {
    const metadata = metadatas[index] || {};
    const distance = distances[index];

    return {
      rank: index + 1,
      relevance: formatRelevanceScore(distance),
      file: metadata.source || metadata.filename || "Unknown",
      function: metadata.function_name || null,
      lines: metadata.line_start
        ? `${metadata.line_start}${
            metadata.line_end ? `-${metadata.line_end}` : ""
          }`
        : null,
      content: truncateContent(doc),
      metadata: {
        ...metadata,
        distance: distance,
      },
      source: "vector",
    };
  });
}

export const semanticCodeSearchTool = new DynamicStructuredTool({
  name: "semantic_code_search",
  description:
    "Search the codebase for relevant code snippets, files, or functions. Combines vector-based semantic search with direct file system search for comprehensive results. Input: a natural language query describing what you're looking for. Returns up to 20 relevant code snippets with metadata.",

  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "A descriptive query about what code you're looking for (max 1000 chars)",
        maxLength: 1000,
      },
      topK: {
        type: "number",
        description: "Number of results to return (1-20, default: 3)",
        minimum: 1,
        maximum: 20,
        default: 3,
      },
      searchMode: {
        type: "string",
        description: "Search mode: 'both' (default), 'vector', or 'filesystem'",
        enum: ["both", "vector", "filesystem"],
        default: "both",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },

  func: async (input) => {
    const startTime = Date.now();

    try {
      console.log("[SemanticCodeSearch] Raw input received:", {
        type: typeof input,
        value: input,
        stringified: JSON.stringify(input),
      });

      // Parse and validate input - more robust parsing
      let query,
        topK = 3,
        searchMode = "both";

      // Handle different input formats more carefully
      if (typeof input === "string") {
        try {
          // Try to parse as JSON first
          const parsed = JSON.parse(input);
          if (parsed && typeof parsed === "object") {
            query = parsed.query;
            topK = parsed.topK || 3;
            searchMode = parsed.searchMode || "both";
          } else {
            query = input; // Fallback to treating the string as the query
          }
        } catch (parseError) {
          console.log(
            "[SemanticCodeSearch] JSON parse failed, using as plain query:",
            parseError.message
          );
          query = input; // Treat the entire string as the query
        }
      } else if (typeof input === "object" && input !== null) {
        query = input.query;
        topK = input.topK || 3;
        searchMode = input.searchMode || "both";
      } else {
        const errorMsg = {
          error: "Invalid input format",
          received: typeof input,
          receivedValue: String(input),
          expected: "object with query property or query string",
        };
        console.error(
          "[SemanticCodeSearch] Input validation failed:",
          errorMsg
        );
        return JSON.stringify(errorMsg);
      }

      // Validate and sanitize inputs with better error handling
      try {
        if (!query) {
          throw new Error("Query is required but was not provided");
        }
        query = validateAndSanitizeQuery(query);
        topK = validateTopK(topK);
      } catch (validationError) {
        const errorMsg = {
          error: `Input validation failed: ${validationError.message}`,
          received_query:
            typeof query === "string" ? query.substring(0, 100) : String(query),
          received_input: input,
        };
        console.error("[SemanticCodeSearch] Validation failed:", errorMsg);
        return JSON.stringify(errorMsg);
      }

      console.log(
        `[SemanticCodeSearch] Processed - Mode: ${searchMode}, Query: "${query}", Top: ${topK}`
      );

      let vectorResults = [];
      let fileSystemResults = [];
      let errors = [];

      // Execute searches based on mode
      if (searchMode === "vector" || searchMode === "both") {
        try {
          vectorResults = await vectorSearch(query, Math.ceil(topK / 2));
        } catch (error) {
          console.error("[VectorSearch] Error:", error.message);
          errors.push(`Vector search failed: ${error.message}`);

          // If vector search fails and we're in "both" mode, increase filesystem results
          if (searchMode === "both") {
            topK = Math.min(20, topK * 2);
          }
        }
      }

      if (searchMode === "filesystem" || searchMode === "both") {
        try {
          const fsMatches = await fileSystemSearch(query, Math.ceil(topK / 2));
          fileSystemResults = fsMatches.map((match, index) => ({
            rank: index + 1,
            relevance: "N/A",
            file: match.file,
            function: null,
            lines: `${match.contextStart}-${match.contextEnd}`,
            content: match.context,
            metadata: {
              line_number: match.lineNumber,
              matched_line: match.line,
              full_path: match.fullPath,
            },
            source: "filesystem",
          }));
        } catch (error) {
          console.error("[FileSystemSearch] Error:", error.message);
          errors.push(`File system search failed: ${error.message}`);
        }
      }

      // Combine and deduplicate results
      const allResults = [...vectorResults, ...fileSystemResults];
      const uniqueResults = [];
      const seenFiles = new Set();

      allResults.forEach((result) => {
        const fileKey = `${result.file}:${result.lines}`;
        if (!seenFiles.has(fileKey)) {
          seenFiles.has(fileKey);
          uniqueResults.push(result);
        }
      });

      // Sort by relevance, with vector results first (they have numeric relevance scores)
      uniqueResults.sort((a, b) => {
        if (a.source === "vector" && b.source === "filesystem") return -1;
        if (a.source === "filesystem" && b.source === "vector") return 1;

        const relevanceA = parseFloat(a.relevance) || 0;
        const relevanceB = parseFloat(b.relevance) || 0;
        return relevanceB - relevanceA;
      });

      const finalResults = uniqueResults.slice(0, topK);

      if (finalResults.length === 0) {
        return JSON.stringify({
          message: `No relevant code found for: "${query}"`,
          suggestions: [
            "Try broader or more specific search terms",
            "Check if the codebase has been indexed (for vector search)",
            "Verify files exist in the project directory",
            "Try different search modes: 'vector', 'filesystem', or 'both'",
          ],
          search_info: {
            collection: CHROMA_COLLECTION_NAME,
            project_root: PROJECT_ROOT,
            query_length: query.length,
            search_mode: searchMode,
            response_time_ms: Date.now() - startTime,
            errors: errors,
          },
        });
      }

      // Create formatted text output
      let resultText = `🔍 Found ${finalResults.length} relevant code snippets for "${query}":\n`;
      if (searchMode === "both") {
        resultText += `📊 Search sources: Vector DB (${vectorResults.length}) + File System (${fileSystemResults.length})\n`;
      }
      resultText += `\n`;

      finalResults.forEach((result) => {
        resultText += `=== Result ${result.rank} (${result.relevance}% relevant) ===\n`;
        resultText += `📁 File: ${result.file}\n`;
        if (result.function) resultText += `⚡ Function: ${result.function}\n`;
        if (result.lines) resultText += `📍 Lines: ${result.lines}\n`;
        resultText += `🔍 Source: ${result.source}\n`;
        resultText += `💻 Code:\n${result.content}\n\n`;
      });

      resultText += `\n📊 Search completed in ${Date.now() - startTime}ms`;
      if (errors.length > 0) {
        resultText += `\n⚠️  Warnings: ${errors.join(", ")}`;
      }

      console.log(
        `[SemanticCodeSearch] Returning ${finalResults.length} results successfully`
      );

      // Return the response - ensure it's valid JSON
      const response = {
        success: true,
        formatted_results: resultText,
        structured_results: finalResults,
        search_info: {
          query: query,
          result_count: finalResults.length,
          search_mode: searchMode,
          collection: CHROMA_COLLECTION_NAME,
          project_root: PROJECT_ROOT,
          vector_results: vectorResults.length,
          filesystem_results: fileSystemResults.length,
          response_time_ms: Date.now() - startTime,
          errors: errors,
        },
      };

      // Validate the response can be serialized
      try {
        const serialized = JSON.stringify(response);
        console.log(
          `[SemanticCodeSearch] Response serialized successfully (${serialized.length} chars)`
        );
        return serialized;
      } catch (serializationError) {
        console.error(
          "[SemanticCodeSearch] Response serialization failed:",
          serializationError
        );
        return JSON.stringify({
          error: "Response serialization failed",
          message: serializationError.message,
          result_count: finalResults.length,
        });
      }
    } catch (err) {
      const errorDuration = Date.now() - startTime;

      console.error("[SemanticCodeSearch] Error:", {
        message: err.message,
        code: err.code,
        status: err.response?.status,
        duration_ms: errorDuration,
      });

      // Categorize errors for better user experience
      let errorCategory = "unknown";
      let userMessage = "";
      let suggestions = [];

      if (err.code === "ECONNREFUSED") {
        errorCategory = "connection";
        userMessage = `Cannot connect to semantic search service at ${CHROMA_BRIDGE_URL}`;
        suggestions = [
          "Verify the Chroma service is running",
          "Try using filesystem search mode only",
          "Check network connectivity",
        ];
      } else if (err.code === "ENOTFOUND") {
        errorCategory = "dns";
        userMessage = `Cannot resolve semantic search service host: ${CHROMA_BRIDGE_URL}`;
        suggestions = [
          "Check the CHROMA_BRIDGE_URL environment variable",
          "Try using filesystem search mode only",
          "Verify DNS/network configuration",
        ];
      } else if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
        errorCategory = "timeout";
        userMessage = `Search request timed out after ${errorDuration}ms`;
        suggestions = [
          "Try a simpler query",
          "Use filesystem search mode for faster results",
          "Check if the service is overloaded",
        ];
      } else {
        errorCategory = "general";
        userMessage = `Search failed: ${err.message}`;
        suggestions = [
          "Try filesystem search mode",
          "Check your query format",
          "Verify project directory exists",
        ];
      }

      return JSON.stringify({
        error: userMessage,
        category: errorCategory,
        suggestions: suggestions,
        debug_info: {
          service_url: CHROMA_BRIDGE_URL,
          collection: CHROMA_COLLECTION_NAME,
          project_root: PROJECT_ROOT,
          error_code: err.code,
          status: err.response?.status,
          duration_ms: errorDuration,
        },
      });
    }
  },
});
