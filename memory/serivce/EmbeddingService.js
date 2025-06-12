import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

class EmbeddingService {
  constructor() {
    this.embeddings = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      if (!process.env.GOOGLE_API_KEY) {
        throw new Error("GOOGLE_API_KEY environment variable is required");
      }

      this.embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GOOGLE_API_KEY,
        model: "text-embedding-004",
      });

      // Test the embeddings
      await this.embeddings.embedQuery("test");
      this.initialized = true;
      console.log("[EmbeddingService] Initialized successfully");
    } catch (error) {
      console.error("[EmbeddingService] Initialization failed:", error);
      throw error;
    }
  }

  async embedText(text) {
    await this.initialize();

    try {
      return await this.embeddings.embedQuery(text);
    } catch (error) {
      console.error("[EmbeddingService] Failed to embed text:", error);
      throw error;
    }
  }

  async embedDocuments(documents) {
    await this.initialize();

    try {
      return await this.embeddings.embedDocuments(documents);
    } catch (error) {
      console.error("[EmbeddingService] Failed to embed documents:", error);
      throw error;
    }
  }

  // Utility function for similarity calculation (fallback when ChromaDB is not available)
  static cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error("Vectors must have the same dimension");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Simple text similarity for fallback
  static textSimilarity(text1, text2) {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);

    const allWords = new Set([...words1, ...words2]);
    const intersection = words1.filter((word) => words2.includes(word));

    return intersection.length / allWords.size;
  }
}

// Export singleton instance
const embeddingService = new EmbeddingService();
export default embeddingService;
