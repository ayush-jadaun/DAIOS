import VectorMemory from "./VectorMemory.js";

// Supported agent types and their configurations
const AGENT_TYPES = {
  cmo: {
    name: "Chief Marketing Officer",
    memoryNamespace: "cmo-memory",
    sessionLimit: 5,
    vectorTopK: 3,
    maxInteractions: 20,
  },
  dev: {
    name: "Developer",
    memoryNamespace: "dev-memory",
    sessionLimit: 8,
    vectorTopK: 5,
    maxInteractions: 30,
  },
  debug: {
    name: "Debug Specialist",
    memoryNamespace: "debug-memory",
    sessionLimit: 10,
    vectorTopK: 7,
    maxInteractions: 25,
  },
  ops: {
    name: "Operations",
    memoryNamespace: "ops-memory",
    sessionLimit: 6,
    vectorTopK: 4,
    maxInteractions: 20,
  },
  orchestra: {
    name: "Orchestra Coordinator",
    memoryNamespace: "orchestra-memory",
    sessionLimit: 12,
    vectorTopK: 8,
    maxInteractions: 40,
  },
};

class MemoryManager {
  constructor(agentType = "cmo") {
    // Validate agent type
    if (!AGENT_TYPES[agentType]) {
      throw new Error(
        `Unsupported agent type: ${agentType}. Supported types: ${Object.keys(
          AGENT_TYPES
        ).join(", ")}`
      );
    }

    this.agentType = agentType;
    this.agentConfig = AGENT_TYPES[agentType];
    this.vectorMemory = new VectorMemory(this.agentConfig.memoryNamespace);
    this.sessionMemory = new Map();
    this.isReady = false;
    this.initializationError = null;
  }

  async initialize() {
    try {
      console.log(
        `[MemoryManager] Initializing for ${this.agentConfig.name} (${this.agentType}) agent...`
      );

      // Check environment variables first
      if (!process.env.GOOGLE_API_KEY) {
        throw new Error("GOOGLE_API_KEY environment variable is required");
      }

      await this.vectorMemory.initialize();
      this.isReady = true;
      this.initializationError = null;

      const stats = await this.vectorMemory.getMemoryStats();
      console.log(
        `[MemoryManager] Initialized for ${this.agentConfig.name} (${this.agentType}) agent:`,
        stats
      );

      if (this.vectorMemory.isUsingFallback()) {
        console.warn(
          `[MemoryManager] Running in fallback mode - vector search disabled for ${this.agentType} agent`
        );
      }
    } catch (error) {
      console.warn(
        `[MemoryManager] Failed to initialize ${this.agentType} agent, using minimal mode:`,
        error.message
      );
      this.isReady = false;
      this.initializationError = error.message;

      // Force fallback mode if vector memory exists
      if (this.vectorMemory) {
        this.vectorMemory.forceFallbackMode();
      }
    }
  }

  async storeInteraction(userTask, result, sessionId = "default") {
    if (!userTask || !result) {
      console.warn(
        `[MemoryManager:${this.agentType}] Invalid interaction data provided`
      );
      return;
    }

    // Session memory works regardless of vector memory status
    if (!this.sessionMemory.has(sessionId)) {
      this.sessionMemory.set(sessionId, []);
    }

    const interaction = {
      userTask: String(userTask),
      result: String(result),
      timestamp: new Date().toISOString(),
      agentType: this.agentType,
    };

    this.sessionMemory.get(sessionId).push(interaction);

    // Keep only configured max interactions per session
    const sessionHistory = this.sessionMemory.get(sessionId);
    if (sessionHistory.length > this.agentConfig.maxInteractions) {
      this.sessionMemory.set(
        sessionId,
        sessionHistory.slice(-this.agentConfig.maxInteractions)
      );
    }

    // Try vector storage if available
    if (this.vectorMemory) {
      try {
        await this.vectorMemory.storeMemory(userTask, result, {
          sessionId,
          agentType: this.agentType,
          agentName: this.agentConfig.name,
        });
      } catch (error) {
        console.warn(
          `[MemoryManager:${this.agentType}] Vector storage failed:`,
          error.message
        );
      }
    }

    console.log(
      `[MemoryManager:${this.agentType}] Stored interaction for session: ${sessionId} (${sessionHistory.length} total)`
    );
  }

  async getRelevantContext(query, sessionId = "default", options = {}) {
    const {
      includeSession = true,
      vectorTopK = this.agentConfig.vectorTopK,
      sessionLimit = this.agentConfig.sessionLimit,
    } = options;

    if (!query) {
      console.warn(
        `[MemoryManager:${this.agentType}] Empty query provided for context retrieval`
      );
      return [];
    }

    let context = [];

    // Try vector context first (if available and not in fallback mode)
    if (this.vectorMemory && !this.vectorMemory.isUsingFallback()) {
      try {
        const vectorContext = await this.vectorMemory.retrieveContext(
          query,
          vectorTopK
        );
        context.push(
          ...vectorContext.map((item) => ({
            type: "vector",
            agentType: this.agentType,
            ...item,
          }))
        );
        console.log(
          `[MemoryManager:${this.agentType}] Retrieved ${vectorContext.length} vector context items`
        );
      } catch (error) {
        console.warn(
          `[MemoryManager:${this.agentType}] Vector retrieval failed:`,
          error.message
        );
      }
    }

    // Add session context
    if (includeSession && this.sessionMemory.has(sessionId)) {
      const sessionHistory = this.sessionMemory.get(sessionId);
      const sessionContext = sessionHistory
        .slice(-sessionLimit)
        .map((interaction) => ({
          type: "session",
          agentType: this.agentType,
          content: `Previous ${this.agentConfig.name}: ${interaction.userTask} -> ${interaction.result}`,
          metadata: {
            timestamp: interaction.timestamp,
            sessionId: sessionId,
            agentType: this.agentType,
          },
        }));

      context.unshift(...sessionContext);
      console.log(
        `[MemoryManager:${this.agentType}] Retrieved ${sessionContext.length} session context items`
      );
    }

    console.log(
      `[MemoryManager:${this.agentType}] Total context items: ${context.length}`
    );
    return context;
  }

  formatContextForPrompt(contextItems) {
    if (!contextItems || contextItems.length === 0) {
      return "";
    }

    const sessionContext = contextItems
      .filter((item) => item.type === "session")
      .map((item) => item.content)
      .join("\n");

    const vectorContext = contextItems
      .filter((item) => item.type === "vector")
      .map((item) => item.content)
      .join("\n");

    let formatted = "";

    if (sessionContext) {
      formatted += `Recent ${this.agentConfig.name} Session Context:\n${sessionContext}\n\n`;
    }

    if (vectorContext) {
      formatted += `Relevant ${this.agentConfig.name} Historical Context:\n${vectorContext}\n\n`;
    }

    return formatted;
  }

  // Clear session memory
  clearSession(sessionId = "default") {
    const hadSession = this.sessionMemory.has(sessionId);
    this.sessionMemory.delete(sessionId);
    console.log(
      `[MemoryManager:${this.agentType}] Cleared session: ${sessionId} (existed: ${hadSession})`
    );
  }

  // Clear all memory
  async clearAllMemory() {
    const sessionCount = this.sessionMemory.size;
    this.sessionMemory.clear();

    if (this.vectorMemory) {
      try {
        await this.vectorMemory.clearMemory();
        console.log(
          `[MemoryManager:${this.agentType}] Cleared all memory (${sessionCount} sessions + vector store)`
        );
      } catch (error) {
        console.error(
          `[MemoryManager:${this.agentType}] Failed to clear vector memory:`,
          error
        );
      }
    } else {
      console.log(
        `[MemoryManager:${this.agentType}] Cleared session memory (${sessionCount} sessions)`
      );
    }
  }

  // Get memory statistics
  async getMemoryStatus() {
    const status = {
      agentType: this.agentType,
      agentName: this.agentConfig.name,
      memoryNamespace: this.agentConfig.memoryNamespace,
      isReady: this.isReady,
      initializationError: this.initializationError,
      sessionCount: this.sessionMemory.size,
      sessions: Array.from(this.sessionMemory.keys()),
      configuration: {
        sessionLimit: this.agentConfig.sessionLimit,
        vectorTopK: this.agentConfig.vectorTopK,
        maxInteractions: this.agentConfig.maxInteractions,
      },
      vectorMemory: null,
    };

    if (this.vectorMemory) {
      try {
        status.vectorMemory = await this.vectorMemory.getMemoryStats();
      } catch (error) {
        status.vectorMemory = { error: error.message };
      }
    }

    return status;
  }

  // Health check
  async healthCheck() {
    const health = {
      agentType: this.agentType,
      agentName: this.agentConfig.name,
      sessionMemory: true,
      vectorMemory: false,
      embeddings: false,
    };

    try {
      // Check if we can store and retrieve from session memory
      const testSessionId = `health-check-${this.agentType}`;
      await this.storeInteraction(
        `test task for ${this.agentType}`,
        `test result from ${this.agentConfig.name}`,
        testSessionId
      );
      const context = await this.getRelevantContext("test", testSessionId);
      this.clearSession(testSessionId);
      health.sessionMemory = context.length > 0;
    } catch (error) {
      health.sessionMemory = false;
      console.error(
        `[MemoryManager:${this.agentType}] Session memory health check failed:`,
        error
      );
    }

    if (this.vectorMemory) {
      try {
        const stats = await this.vectorMemory.getMemoryStats();
        health.vectorMemory =
          stats.mode === "chromadb" && stats.status === "connected";
        health.embeddings = !this.vectorMemory.isUsingFallback();
      } catch (error) {
        health.vectorMemory = false;
        health.embeddings = false;
        console.error(
          `[MemoryManager:${this.agentType}] Vector memory health check failed:`,
          error
        );
      }
    }

    return health;
  }

  // Get agent configuration
  getAgentConfig() {
    return {
      ...this.agentConfig,
      agentType: this.agentType,
    };
  }

  // Static method to get all supported agent types
  static getSupportedAgentTypes() {
    return Object.keys(AGENT_TYPES).map((type) => ({
      type,
      ...AGENT_TYPES[type],
    }));
  }

  // Static method to create memory manager for specific agent
  static createForAgent(agentType) {
    return new MemoryManager(agentType);
  }
}

export default MemoryManager;
