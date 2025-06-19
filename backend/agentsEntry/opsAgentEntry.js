import { subscribeToOpsTasks, runOpsAgent } from "../agents/opsAgent.js";
console.log("[OpsAgentEntry] Starting Ops Agent...");
subscribeToOpsTasks(runOpsAgent);
