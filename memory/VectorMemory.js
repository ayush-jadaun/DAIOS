import embeddingService from "./serivce/EmbeddingService.js";
import { ChromaRestClient } from "./chromaClient.js";

/**
 * VectorMemory class manages storing and retrieving vector-based memory using
 * an external Chroma REST API, with an in-memory fallback.
 */
class VectorMemory {
  constructor(collectionName) {
    this.collectionName = collectionName;
    this.taskType = collectionName.replace("-memory", "");
    this.client = new ChromaRestClient(
      process.env.CHROMA_URL || "http://localhost:8001"
    );
    this.initialized = false;
    this.fallbackMode = false;
    this.fallbackMemory = [];
  }

  /**
   * Initializes the memory system. Checks embedding availability.
   */
  async initialize() {
    if (this.initialized) return;
    try {
      await embeddingService.embedText("test connection");
      this.initialized = true;
      this.fallbackMode = false;
      console.log(`[VectorMemory] Embeddings working`);
    } catch (err) {
      console.warn(
        "[VectorMemory] Embeddings not available, using fallback mode"
      );
      this.initialized = true;
      this.fallbackMode = true;
      this.fallbackMemory = [];
    }
  }

  /**
   * Stores a memory/document in Chroma or in-memory fallback.
   */
  async storeMemory(userTask, result, metadata = {}) {
    await this.initialize();

    const document = `Task: ${userTask}\nResult: ${result}`;
    const meta = {
      timestamp: new Date().toISOString(),
      taskType: this.taskType,
      id: `${this.taskType}-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`,
      ...metadata,
    };

    try {
      if (this.fallbackMode) {
        this.fallbackMemory.push({ pageContent: document, metadata: meta });
        if (this.fallbackMemory.length > 50) {
          this.fallbackMemory = this.fallbackMemory.slice(-50);
        }
        console.log("[VectorMemory] Memory stored in fallback mode");
      } else {
        await this.client.add(
          this.collectionName,
          [document],
          [meta],
          [meta.id]
        );
        console.log("[VectorMemory] Memory stored in Chroma REST API");
      }
    } catch (error) {
      console.error("[VectorMemory] Failed to store memory:", error);
      if (!this.fallbackMode) {
        this.fallbackMode = true;
        this.fallbackMemory.push({ pageContent: document, metadata: meta });
      }
    }
  }

  /**
   * Retrieves context relevant to the provided query.
   * Tries Chroma vector search, then falls back to in-memory search.
   */
  async retrieveContext(query, topK = 3) {
    await this.initialize();
    try {
      if (this.fallbackMode) {
        const results = this.fallbackMemory
          .filter(
            (doc) =>
              doc.pageContent.toLowerCase().includes(query.toLowerCase()) ||
              query
                .toLowerCase()
                .split(" ")
                .some((word) => doc.pageContent.toLowerCase().includes(word))
          )
          .slice(-topK);

        console.log(
          `[VectorMemory] Retrieved ${results.length} context items (fallback mode)`
        );
        return results.map((doc) => ({
          content: doc.pageContent,
          metadata: doc.metadata,
        }));
      } else {
        const results = await this.client.query(
          this.collectionName,
          [query],
          topK
        );
        // Chroma returns documents as a list of lists: [{documents: [[...]], metadatas: [[...]]}]
        return (results.documents?.[0] || []).map((content, idx) => ({
          content,
          metadata: results.metadatas?.[0]?.[idx] || {},
        }));
      }
    } catch (error) {
      console.error("[VectorMemory] Failed to retrieve context:", error);
      if (!this.fallbackMode) {
        this.fallbackMode = true;
        return this.retrieveContext(query, topK);
      }
      return [];
    }
  }

  /**
   * Clears all memory from Chroma or fallback.
   */
  async clearMemory() {
    await this.initialize();
    if (this.fallbackMode) {
      this.fallbackMemory = [];
      console.log("[VectorMemory] Fallback memory cleared");
    } else {
      await this.client.delete(this.collectionName);
      console.log("[VectorMemory] Cleared Chroma collection");
    }
  }

  /**
   * Returns true if currently in fallback mode.
   */
  isUsingFallback() {
    return this.fallbackMode;
  }

  /**
   * Returns memory stats (mode, count, etc).
   */
  async getMemoryStats() {
    await this.initialize();
    if (this.fallbackMode) {
      return {
        mode: "fallback",
        count: this.fallbackMemory.length,
        maxSize: 50,
      };
    }
    return {
      mode: "chromadb",
      status: "connected",
      collection: this.collectionName,
    };
  }

  /**
   * Forces fallback mode (for testing).
   */
  forceFallbackMode() {
    this.fallbackMode = true;
    this.fallbackMemory = this.fallbackMemory || [];
    console.log("[VectorMemory] Forced into fallback mode");
  }
}

export default VectorMemory;
