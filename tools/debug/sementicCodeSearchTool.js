import { DynamicStructuredTool } from "@langchain/core/tools";
import axios from "axios";

const CHROMA_BRIDGE_URL =
  process.env.CHROMA_BRIDGE_URL || "http://chroma-service:8001";
const CHROMA_COLLECTION_NAME = process.env.CHROMA_CODE_COLLECTION || "codebase";

export const semanticCodeSearchTool = new DynamicStructuredTool({
  name: "semantic_code_search",
  description:
    "Search the codebase for relevant code snippets, files, or functions related to a concept or question. Input: a natural language query describing what you're looking for.",

  // Simplified schema - LangChain sometimes has issues with complex schemas
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "A descriptive query about what code you're looking for",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },

  func: async (input) => {
    try {
      console.log(
        "[SemanticCodeSearch] Raw input received:",
        JSON.stringify(input)
      );

      // Handle different input formats that LangChain might send
      let query;
      let topK = 3;

      if (typeof input === "string") {
        // Sometimes LangChain passes a string instead of object
        try {
          const parsed = JSON.parse(input);
          query = parsed.query;
          topK = parsed.topK || 3;
        } catch {
          query = input;
        }
      } else if (typeof input === "object") {
        query = input.query;
        topK = input.topK || 3;
      } else {
        console.error("[SemanticCodeSearch] Invalid input type:", typeof input);
        return JSON.stringify({
          error: "Invalid input format",
          received: typeof input,
          expected: "object with query property",
        });
      }

      console.log("[SemanticCodeSearch] Processed query:", query);
      console.log("[SemanticCodeSearch] topK:", topK);

      // Validate query
      if (!query || typeof query !== "string" || query.trim().length === 0) {
        console.error("[SemanticCodeSearch] Invalid query:", query);
        return JSON.stringify({
          error: "Query must be a non-empty string",
          received: query,
        });
      }

      // Ensure topK is valid
      topK = Math.max(1, Math.min(10, parseInt(topK) || 3));

      console.log(
        `[SemanticCodeSearch] Searching for: "${query}" (top ${topK} results)`
      );
      console.log(`[SemanticCodeSearch] Calling: ${CHROMA_BRIDGE_URL}/query`);

      // Call your Chroma bridge API
      const requestPayload = {
        collection: CHROMA_COLLECTION_NAME,
        query_texts: [query],
        n_results: topK,
      };

      console.log(
        "[SemanticCodeSearch] Request payload:",
        JSON.stringify(requestPayload)
      );

      const response = await axios.post(
        `${CHROMA_BRIDGE_URL}/query`,
        requestPayload,
        {
          timeout: 15000, // 15 second timeout
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log("[SemanticCodeSearch] Response status:", response.status);
      console.log(
        "[SemanticCodeSearch] Response data:",
        JSON.stringify(response.data, null, 2)
      );

      // Check if we got valid results
      if (!response.data) {
        return JSON.stringify({
          error: "No data returned from semantic search service",
          service_url: CHROMA_BRIDGE_URL,
          collection: CHROMA_COLLECTION_NAME,
        });
      }

      // Format results for the agent
      const documents = response.data.documents?.[0] || [];
      const metadatas = response.data.metadatas?.[0] || [];
      const distances = response.data.distances?.[0] || [];

      if (documents.length === 0) {
        return JSON.stringify({
          message: `No relevant code found for query: "${query}"`,
          suggestions: [
            "Try a more specific query",
            "Check if the code collection is populated",
            "Verify the file exists in the codebase",
          ],
        });
      }

      // Return formatted results
      let resultText = `Found ${documents.length} relevant code snippets for "${query}":\n\n`;

      documents.forEach((doc, index) => {
        const metadata = metadatas[index] || {};
        const distance = distances[index];
        const relevance = distance ? ((1 - distance) * 100).toFixed(1) : "N/A";

        resultText += `=== Result ${index + 1} (${relevance}% relevant) ===\n`;
        resultText += `File: ${
          metadata.source || metadata.filename || "Unknown"
        }\n`;
        if (metadata.function_name)
          resultText += `Function: ${metadata.function_name}\n`;
        if (metadata.line_start)
          resultText += `Lines: ${metadata.line_start}-${
            metadata.line_end || metadata.line_start
          }\n`;
        resultText += `Code:\n${doc}\n\n`;
      });

      console.log(`[SemanticCodeSearch] Returning ${documents.length} results`);
      return resultText;
    } catch (err) {
      console.error("[SemanticCodeSearch] Error details:", {
        message: err.message,
        code: err.code,
        response: err.response?.data,
        status: err.response?.status,
      });

      let errorMessage = "Semantic code search failed: ";

      if (err.code === "ECONNREFUSED") {
        errorMessage += `Cannot connect to Chroma service at ${CHROMA_BRIDGE_URL}. Service may be down.`;
      } else if (err.code === "ENOTFOUND") {
        errorMessage += `Chroma service host not found: ${CHROMA_BRIDGE_URL}`;
      } else if (err.response?.status === 404) {
        errorMessage += `Collection "${CHROMA_COLLECTION_NAME}" not found or API endpoint invalid`;
      } else if (err.response?.status >= 500) {
        errorMessage += `Chroma service internal error: ${
          err.response.data?.message || err.message
        }`;
      } else if (err.code === "ECONNABORTED") {
        errorMessage +=
          "Request timeout - Chroma service is taking too long to respond";
      } else {
        errorMessage += err.message;
      }

      // Return error as string for the agent
      return JSON.stringify({
        error: errorMessage,
        debug_info: {
          service_url: CHROMA_BRIDGE_URL,
          collection: CHROMA_COLLECTION_NAME,
          error_code: err.code,
          status: err.response?.status,
        },
      });
    }
  },
});
