// And in debugAgentEntry.js:
import { subscribeToDebugTasks, runDebugAgent } from "../agents/debugAgent.js";

console.log("[DebugAgentEntry] Starting Debug Agent...");
subscribeToDebugTasks(runDebugAgent);
