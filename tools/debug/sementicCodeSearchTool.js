import { DynamicStructuredTool } from "@langchain/core/tools";
import axios from "axios";

const CHROMA_BRIDGE_URL = process.env.CHROMA_BRIDGE_URL || "http://chroma-service:8001";
const CHROMA_COLLECTION_NAME = process.env.CHROMA_CODE_COLLECTION || "codebase"; // Set this as env or default

export const semanticCodeSearchTool = new DynamicStructuredTool({
  name: "semantic_code_search",
  description:
    "Search the codebase for relevant code snippets, files, or functions related to a concept or question. Input: a full natural language query. Output: list of relevant code snippets and file references.",
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "A full sentence describing what to search for (e.g., 'How does authentication work?').",
      },
      topK: {
        type: "integer",
        description: "Number of results to return.",
        default: 3,
      },
    },
    required: ["query"],
  },
  func: async ({ query, topK = 3 }) => {
    try {
      // Call your own Chroma bridge API
      const response = await axios.post(`${CHROMA_BRIDGE_URL}/query`, {
        collection: CHROMA_COLLECTION_NAME,
        query_texts: [query],
        n_results: topK,
      });

      // Return the relevant code/document snippets and metadata
      return response.data;
    } catch (err) {
      return { error: "Semantic code search failed: " + err.message };
    }
  },
});
