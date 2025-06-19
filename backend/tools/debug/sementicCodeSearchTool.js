import { DynamicTool } from "@langchain/core/tools";
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

function truncateContent(content, maxLength = 1000) {
  // Reduced from 2000 to prevent long responses
  if (!content || content.length <= maxLength) return content;
  return content.substring(0, maxLength) + "\n... [content truncated]";
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
      maxDepth: 10,
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

// Vector search function
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
      metadata: { ...metadata, distance: distance },
      source: "vector",
    };
  });
}

export const semanticCodeSearchTool = new DynamicTool({
  name: "semantic_code_search",
  description:
    "Search the codebase for relevant code snippets, files, or functions using natural language queries. Input is an object or JSON string with 'query' (required), optional 'topK' (1-10, default: 3), and optional 'searchMode' ('both', 'vector', or 'filesystem', default: 'both'). Returns file paths and code content.",

  func: async (inputJSON) => {
    const startTime = Date.now();

    try {
      console.log("[SemanticCodeSearch] Input received:", inputJSON);

      // Parse input like the working envVarReaderTool
      let parsedInput = {};
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          // If JSON parsing fails, treat as simple query string
          parsedInput = { query: inputJSON };
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        return "Error: Invalid input format. Expected object or JSON string with 'query' field.";
      }

      const { query, topK = 3, searchMode = "both" } = parsedInput;

      if (!query) {
        return "Error: Search query is required. Please provide a description of what code you're looking for.";
      }

      // Validate inputs
      const sanitizedQuery = validateAndSanitizeQuery(query);
      const validatedTopK = Math.min(validateTopK(topK), 5); // Limit to max 5 results to prevent overwhelming responses

      console.log(
        `[SemanticCodeSearch] Searching - Query: "${sanitizedQuery}", Mode: ${searchMode}, Results: ${validatedTopK}`
      );

      let vectorResults = [];
      let fileSystemResults = [];
      let searchErrors = [];

      // Execute searches based on mode
      if (searchMode === "vector" || searchMode === "both") {
        try {
          vectorResults = await vectorSearch(
            sanitizedQuery,
            Math.ceil(validatedTopK / 2)
          );
        } catch (error) {
          console.error("[VectorSearch] Error:", error.message);
          searchErrors.push(`Vector search failed: ${error.message}`);
          // Fallback to filesystem only
          if (searchMode === "both") {
            validatedTopK = Math.min(10, validatedTopK * 2);
          }
        }
      }

      if (searchMode === "filesystem" || searchMode === "both") {
        try {
          const fsMatches = await fileSystemSearch(
            sanitizedQuery,
            Math.ceil(validatedTopK / 2)
          );
          fileSystemResults = fsMatches.map((match, index) => ({
            rank: index + 1,
            relevance: "Filesystem",
            file: match.file,
            function: null,
            lines: `${match.contextStart}-${match.contextEnd}`,
            content: truncateContent(match.context, 800), // Shorter content for filesystem results
            metadata: {
              line_number: match.lineNumber,
              matched_line: match.line,
            },
            source: "filesystem",
          }));
        } catch (error) {
          console.error("[FileSystemSearch] Error:", error.message);
          searchErrors.push(`Filesystem search failed: ${error.message}`);
        }
      }

      // Combine and deduplicate results
      const allResults = [...vectorResults, ...fileSystemResults];
      const uniqueResults = [];
      const seenFiles = new Set();

      allResults.forEach((result) => {
        const fileKey = `${result.file}:${result.lines || "unknown"}`;
        if (!seenFiles.has(fileKey)) {
          seenFiles.add(fileKey);
          uniqueResults.push(result);
        }
      });

      // Sort results - prioritize vector search results
      uniqueResults.sort((a, b) => {
        if (a.source === "vector" && b.source === "filesystem") return -1;
        if (a.source === "filesystem" && b.source === "vector") return 1;
        return 0;
      });

      const finalResults = uniqueResults.slice(0, validatedTopK);

      if (finalResults.length === 0) {
        let noResultsMsg = `No code found matching "${sanitizedQuery}".`;
        if (searchErrors.length > 0) {
          noResultsMsg += ` Search issues: ${searchErrors.join(", ")}`;
        }
        noResultsMsg += ` Try different search terms or check if files exist in the project.`;
        return noResultsMsg;
      }

      // Format results in a clean, parseable way for the agent
      let output = `SEARCH RESULTS for "${sanitizedQuery}" (${finalResults.length} found):\n\n`;

      finalResults.forEach((result, index) => {
        output += `[${index + 1}] ${result.file}`;
        if (result.lines) output += ` (lines ${result.lines})`;
        if (result.function) output += ` - Function: ${result.function}`;
        output += `\n`;

        // Add code content with clear markers
        output += `CODE:\n${result.content}\n`;
        output += `---\n\n`;
      });

      const duration = Date.now() - startTime;
      output += `Search completed in ${duration}ms`;

      if (searchErrors.length > 0) {
        output += ` (with ${searchErrors.length} search errors)`;
      }

      console.log(
        `[SemanticCodeSearch] Returning ${finalResults.length} results in ${duration}ms`
      );
      return output;
    } catch (err) {
      const errorDuration = Date.now() - startTime;
      console.error("[SemanticCodeSearch] Critical error:", err.message);

      // Return simple, clear error message
      let errorMsg = `Search failed: ${err.message}`;

      if (err.code === "ECONNREFUSED") {
        errorMsg += " (Cannot connect to search service)";
      } else if (err.code === "ETIMEDOUT") {
        errorMsg += " (Search timeout)";
      }

      errorMsg += `. Try using filesystem search mode or a simpler query.`;

      return errorMsg;
    }
  },
});
