import {
  subscribeToOrchestraTasks,
  runOrchestraAgent,
} from "../agents/orchestraAgent.js";

console.log("[OrchestraAgentEntry] Starting Orchestra Agent...");
subscribeToOrchestraTasks(runOrchestraAgent);
