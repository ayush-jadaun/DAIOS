import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { serperWebSearch } from "./serperSearch.js";

export const serperTool = new DynamicStructuredTool({
  name: "serper-web-search",
  description:
    'Useful for answering questions about current events or general web information. Action Input must be a JSON object like {"query": "..."}.',
  schema: z.union([
    z.object({
      query: z.string().describe("The search query to look up on the web"),
    }),
    z.string().describe("The search query as a string or JSON string"),
  ]),
  func: async (input) => {
    console.log("Raw input:", input, "Type:", typeof input);

    let query;

    if (typeof input === "object" && input !== null && "query" in input) {
      query = input.query;
    }
    else if (typeof input === "string") {
      let stringToParse = input.trim();

      try {
        if (stringToParse.startsWith('"') && stringToParse.endsWith('"')) {
          stringToParse = JSON.parse(stringToParse);
          console.log("After first parse:", stringToParse);
        }

     
        const parsed = JSON.parse(stringToParse);
        if (parsed && typeof parsed === "object" && "query" in parsed) {
          query = parsed.query;
        } else {
         
          query = input;
        }
      } catch (e) {
        console.log(
          "Failed to parse as JSON, using string as query:",
          e.message
        );
     
        query = input;
      }
    } else {
      throw new Error(
        `Invalid input format. Expected string or object with 'query' property, got: ${JSON.stringify(
          input
        )}`
      );
    }

    if (!query || typeof query !== "string") {
      throw new Error(
        `Could not extract valid query string from input: ${JSON.stringify(
          input
        )}`
      );
    }

    console.log("Final query:", query);

    try {
      const searchResults = await serperWebSearch(query);
      console.log("Search results:", searchResults);

  
      if (typeof searchResults === "string") {
        return searchResults;
      } else if (typeof searchResults === "object") {
       
        return JSON.stringify(searchResults, null, 2);
      } else {
        return `Search completed for: ${query}. Results: ${searchResults}`;
      }
    } catch (error) {
      console.error("Search error:", error);

     
      if (error.message.includes("403")) {
        return `Search service temporarily unavailable (API authentication issue). Unable to fetch current information about "${query}". Please check API configuration or try again later.`;
      }

      return `Search failed for query "${query}": ${error.message}`;
    }
  },
});
