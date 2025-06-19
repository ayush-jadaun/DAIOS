import { subscribeToDevTasks, runDevAgent } from "../agents/devAgent.js";
console.log("[DevAgentEntry] Starting Dev Agent...");
subscribeToDevTasks(runDevAgent);
