import { planskill } from "../skills/planskill.js";
import { runDevAgent } from "./devAgent.js";
import { runDebugAgent } from "./debugAgent.js";
import { runOpsAgent } from "./opsAgent.js";
import { orchestraAgentPrompt } from "../prompts/orchestraAgentPromt.js";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import MessageBus from "../utils/MessageBus.js";

// Map agent roles to their runner functions
const agentMap = {
  dev: runDevAgent,
  debug: runDebugAgent,
  ops: runOpsAgent,
};

const bus = new MessageBus("orchestra");

// Use Gemini instead of Ollama
const llm = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
  model: "models/gemini-2.0-flash",
  temperature: 0.1,
});

// Configuration constants
const MAX_RETRIES_PER_STEP = 2;
const STEP_TIMEOUT = 300000; // 5 minutes per step
const MAX_EXECUTION_TIME = 600000; // 10 minutes total
const PARALLEL_TIMEOUT = 90000; // 90 seconds for parallel execution

// Helper functions for error detection and handling
function isInfiniteLoopError(error) {
  const errorMessage = error.message || error.toString();

  // Check for common infinite loop patterns
  const loopPatterns = [
    /formatting error.*try again/i,
    /encountered a formatting error/i,
    /let me try again with the correct format/i,
    /need to follow the exact format/i,
    /semantic_code_search/i,
    /tool.*format.*error/i,
  ];

  return loopPatterns.some((pattern) => pattern.test(errorMessage));
}

function isToolFormattingError(error) {
  const errorMessage = error.message || error.toString();
  return /formatting error|format.*error|tool.*format|semantic_code_search/i.test(
    errorMessage
  );
}

// Step 1: Use Gemini to decompose the user prompt into agent-specific subtasks
async function planWithGemini(userTask) {
  const systemPrompt = `
You are a development orchestrator.
Given a user request, decompose it into actionable subtasks for these agents:
- dev: Development tasks, coding, implementation, features, APIs, functionality
- debug: Testing, debugging, error handling, validation, quality assurance
- ops: Deployment, infrastructure, monitoring, DevOps, system administration

Return one subtask for each agent in this JSON format:
[
  {"agent": "dev", "subtask": "..."},
  {"agent": "debug", "subtask": "..."},
  {"agent": "ops", "subtask": "..."}
]

User request: "${userTask}"
`;

  const response = await llm.invoke(systemPrompt);
  let subtasks = [];
  try {
    const content = response.content || response.output || response.toString();
    subtasks = JSON.parse(content);
  } catch (e) {
    console.warn("[Orchestra] Failed to parse Gemini response, using fallback");
    subtasks = [
      {
        agent: "dev",
        subtask:
          "Implement the core functionality and features for this request.",
      },
      {
        agent: "debug",
        subtask:
          "Test and debug the implementation, ensure quality and error handling.",
      },
      {
        agent: "ops",
        subtask: "Handle deployment, infrastructure, and operational aspects.",
      },
    ];
  }
  return subtasks;
}

// Enhanced planskill integration for parallel execution
async function createParallelPlan(userTask) {
  try {
    // First try to use planskill for detailed planning
    const plan = await planskill({
      user_query: userTask,
      summary_of_conversation: "",
      possible_vague_parts_of_query: [],
      difficulty_level: 50,
    });

    if (Array.isArray(plan) && plan.length > 0) {
      // Convert planskill output to parallel format
      const agentTasks = { dev: [], debug: [], ops: [] };

      plan.forEach((step) => {
        if (step.agent && agentTasks[step.agent]) {
          agentTasks[step.agent].push({
            step: step.step,
            subtask: step.subtask,
            deliverables: step.deliverables,
          });
        }
      });

      // Create combined subtasks for each agent
      const parallelPlan = Object.entries(agentTasks).map(([agent, tasks]) => ({
        agent,
        subtask:
          tasks.length > 0
            ? tasks.map((t) => `Step ${t.step}: ${t.subtask}`).join("\n")
            : `Handle ${agent} aspects of: ${userTask}`,
        steps: tasks,
      }));

      return parallelPlan;
    }
  } catch (error) {
    console.warn(
      "[Orchestra] Planskill failed, falling back to Gemini planning:",
      error
    );
  }

  // Fallback to Gemini planning
  return await planWithGemini(userTask);
}

// Step 2: Parallel orchestrator function with enhanced capabilities
export async function orchestrateParallel(
  userTask,
  sessionId = "default",
  timeoutMs = PARALLEL_TIMEOUT,
  options = {}
) {
  const executionId = `exec_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
  console.log(
    `[Orchestra] Starting parallel execution ${executionId} with task:`,
    userTask
  );

  const results = {};
  const startTime = Date.now();

  try {
    // Step 1: Get subtasks using enhanced planning
    const subtasks = options.useDetailedPlanning
      ? await createParallelPlan(userTask)
      : await planWithGemini(userTask);

    console.log(
      `[Orchestra] Generated ${subtasks.length} parallel subtasks:`,
      subtasks.map((s) => `${s.agent}: ${s.subtask.substring(0, 100)}...`)
    );

    // Step 2: Set up agent-to-agent communication channels
    const communicationChannels = setupAgentCommunication(executionId);

    // Step 3: Fire off all agent tasks in parallel and await their responses
    const agentPromises = subtasks.map(({ agent, subtask, steps }) => {
      const replyChannel = `orchestrator.${agent}.reply.${executionId}.${Math.random()
        .toString(36)
        .slice(2)}`;

      // Promise that resolves when agent replies or rejects on timeout
      const p = new Promise(async (resolve, reject) => {
        const handler = (msg) => {
          bus.unsubscribe(replyChannel, handler);
          resolve(msg);
        };

        await bus.subscribe(replyChannel, handler);

        const timeout = setTimeout(() => {
          bus.unsubscribe(replyChannel, handler);
          reject(new Error(`${agent} response timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        // Clean up timeout if resolved
        p.finally(() => clearTimeout(timeout));
      });

      // Enhanced task data with agent communication capabilities
      const taskData = {
        userTask: subtask,
        originalTask: userTask,
        sessionId,
        executionId,
        replyChannel,
        steps: steps || [],
        communicationChannels: communicationChannels[agent],
        agentContext: {
          parallelExecution: true,
          otherAgents: subtasks
            .filter((s) => s.agent !== agent)
            .map((s) => s.agent),
          stepId: `${executionId}_${agent}`,
          maxToolRetries: 2,
          preventInfiniteLoops: true,
        },
      };

      // Publish the subtask to the agent
      bus.publish(
        `agent.${agent}.task`,
        `${agent.toUpperCase()}_TASK`,
        taskData
      );

      // Save the result under the agent's name, handling errors
      return p.then(
        (result) => {
          results[agent] = {
            ...result,
            status: "SUCCESS",
            executionTime: Date.now() - startTime,
            agent: agent,
          };
          console.log(`[Orchestra] Agent ${agent} completed successfully`);
          return results[agent];
        },
        (err) => {
          const errorResult = {
            error: err.message,
            status: "ERROR",
            executionTime: Date.now() - startTime,
            agent: agent,
          };
          results[agent] = errorResult;
          console.error(`[Orchestra] Agent ${agent} failed:`, err.message);
          return errorResult;
        }
      );
    });

    // Step 4: Wait for all agents to complete
    await Promise.all(agentPromises);

    // Step 5: Process and coordinate results
    const coordinatedResults = await coordinateResults(
      results,
      userTask,
      executionId
    );

    const executionTime = Date.now() - startTime;
    const finalResult = {
      executionId,
      originalTask: userTask,
      sessionId,
      executionSummary: {
        totalAgents: subtasks.length,
        successfulAgents: Object.values(results).filter(
          (r) => r.status === "SUCCESS"
        ).length,
        failedAgents: Object.values(results).filter((r) => r.status === "ERROR")
          .length,
        executionTime,
        status: determineFinalStatus(results),
      },
      agentResults: results,
      coordinatedOutput: coordinatedResults,
      timestamp: new Date().toISOString(),
    };

    console.log(
      `[Orchestra] Parallel execution ${executionId} completed in ${executionTime}ms`
    );
    return finalResult;
  } catch (error) {
    console.error(
      `[Orchestra] Parallel execution ${executionId} failed:`,
      error
    );
    throw error;
  }
}

// Setup agent-to-agent communication channels
function setupAgentCommunication(executionId) {
  const channels = {
    dev: {
      toDebug: `comm.${executionId}.dev.to.debug`,
      toOps: `comm.${executionId}.dev.to.ops`,
      fromDebug: `comm.${executionId}.debug.to.dev`,
      fromOps: `comm.${executionId}.ops.to.dev`,
    },
    debug: {
      toDev: `comm.${executionId}.debug.to.dev`,
      toOps: `comm.${executionId}.debug.to.ops`,
      fromDev: `comm.${executionId}.dev.to.debug`,
      fromOps: `comm.${executionId}.ops.to.debug`,
    },
    ops: {
      toDev: `comm.${executionId}.ops.to.dev`,
      toDebug: `comm.${executionId}.ops.to.debug`,
      fromDev: `comm.${executionId}.dev.to.ops`,
      fromDebug: `comm.${executionId}.debug.to.ops`,
    },
  };

  // Set up cross-agent communication listeners
  Object.keys(channels).forEach((fromAgent) => {
    Object.keys(channels).forEach((toAgent) => {
      if (fromAgent !== toAgent) {
        const channel = `comm.${executionId}.${fromAgent}.to.${toAgent}`;
        bus.subscribe(channel, (msg) => {
          console.log(
            `[Orchestra] Agent communication: ${fromAgent} -> ${toAgent}`,
            msg
          );
        });
      }
    });
  });

  return channels;
}

// Coordinate and synthesize results from all agents
async function coordinateResults(results, userTask, executionId) {
  try {
    const successfulResults = Object.entries(results)
      .filter(([_, result]) => result.status === "SUCCESS")
      .map(([agent, result]) => ({ agent, ...result }));

    if (successfulResults.length === 0) {
      return "All agents failed to complete their tasks.";
    }

    const coordinationPrompt = `
You are coordinating the results from multiple specialized agents working on this task: "${userTask}"

Agent Results:
${successfulResults
  .map(
    (r) => `
${r.agent.toUpperCase()} Agent Result:
${JSON.stringify(r.result || r.data || r, null, 2)}
`
  )
  .join("\n")}

Please provide a coordinated summary that:
1. Integrates all successful agent outputs
2. Identifies any conflicts or gaps
3. Provides actionable next steps
4. Highlights key deliverables from each agent

Keep the response concise but comprehensive.
`;

    const coordination = await llm.invoke(coordinationPrompt);
    return coordination.content || coordination.toString();
  } catch (error) {
    console.error("[Orchestra] Result coordination failed:", error);
    return "Result coordination failed, but individual agent results are available.";
  }
}

// Determine final execution status
function determineFinalStatus(results) {
  const agents = Object.keys(results);
  const successful = agents.filter(
    (agent) => results[agent].status === "SUCCESS"
  );
  const failed = agents.filter((agent) => results[agent].status === "ERROR");

  if (failed.length === 0) {
    return "SUCCESS";
  } else if (successful.length === 0) {
    return "FAILED";
  } else {
    return "PARTIAL_SUCCESS";
  }
}

// Legacy sequential orchestrator (preserved for compatibility)
export async function runOrchestraAgent(userTask, pubSubOptions = {}) {
  const executionId = `seq_exec_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
  console.log(
    `[OrchestraAgent] Starting sequential execution ${executionId} with task:`,
    userTask
  );

  try {
    // Step 1: Use planskill to decompose the task and create execution plan
    const plan = await planskill({
      user_query: userTask,
      summary_of_conversation: "",
      possible_vague_parts_of_query: [],
      difficulty_level: 50,
    });

    if (!Array.isArray(plan) || !plan.length) {
      throw new Error("No plan generated by planskill.");
    }

    console.log(
      `[OrchestraAgent] Generated plan with ${plan.length} steps:`,
      plan.map((step) => `${step.step}: ${step.subtask} (${step.agent})`)
    );

    // Step 2: Execute plan using Orchestra Agent orchestration
    const orchestraResult = await executeOrchestratedPlan(
      plan,
      userTask,
      executionId
    );

    // Step 3: Optionally publish result to message bus
    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.orchestra",
        "ORCHESTRA_RESULT",
        orchestraResult
      );
    }

    console.log(
      `[OrchestraAgent] Sequential execution ${executionId} completed successfully`
    );
    return orchestraResult;
  } catch (error) {
    console.error(
      `[OrchestraAgent] Sequential execution ${executionId} failed:`,
      error
    );
    if (pubSubOptions.publishResult) {
      await bus.publish(
        pubSubOptions.publishChannel || "agent.orchestra",
        "ORCHESTRA_ERROR",
        { userTask, error: error.message || error, executionId }
      );
    }
    throw error;
  }
}

// All the original sequential execution functions preserved
async function executeOrchestratedPlan(plan, userQuery, executionId) {
  const startTime = Date.now();
  const workflowState = {
    executionId,
    completedSteps: [],
    failedSteps: [],
    currentStepIndex: 0,
    results: [],
    conversationHistory: [],
    stepRetries: new Map(),
    startTime,
    plan,
  };

  console.log(
    `[Orchestra] Starting orchestrated execution ${executionId} of plan with ${plan.length} steps`
  );

  for (let i = 0; i < plan.length; i++) {
    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
      console.error(
        `[Orchestra] Execution ${executionId} timed out after ${MAX_EXECUTION_TIME}ms`
      );
      break;
    }

    const currentStep = plan[i];
    workflowState.currentStepIndex = i;

    if (workflowState.completedSteps.includes(currentStep.step)) {
      console.log(
        `[Orchestra] Step ${currentStep.step} already completed, skipping`
      );
      continue;
    }

    const stepId = `${executionId}_step_${currentStep.step}`;
    console.log(
      `[Orchestra] Executing Step ${i + 1}/${plan.length} (ID: ${stepId}): ${
        currentStep.subtask
      }`
    );

    try {
      const stepResult = await executeStepWithRetry(
        currentStep,
        workflowState,
        userQuery,
        stepId
      );

      if (!workflowState.completedSteps.includes(currentStep.step)) {
        workflowState.completedSteps.push(currentStep.step);
        workflowState.results.push(stepResult);
        workflowState.conversationHistory.push({
          stepId,
          step: currentStep.step,
          status: "completed",
          result: stepResult,
          timestamp: new Date().toISOString(),
        });
      }

      console.log(
        `[Orchestra] Step ${currentStep.step} completed successfully`
      );
    } catch (error) {
      console.error(`[Orchestra] Step ${i + 1} failed permanently:`, error);

      const failureInfo = {
        step: currentStep.step,
        error: error.message,
        timestamp: new Date().toISOString(),
        retryAttempts: workflowState.stepRetries.get(currentStep.step) || 0,
      };

      workflowState.failedSteps.push(failureInfo);
      workflowState.conversationHistory.push({
        stepId,
        step: currentStep.step,
        status: "failed",
        error: failureInfo,
        timestamp: new Date().toISOString(),
      });

      const shouldContinue = await handleStepFailure(
        error,
        currentStep,
        workflowState,
        plan,
        userQuery
      );

      if (!shouldContinue) {
        console.log(
          `[Orchestra] Aborting workflow ${executionId} due to critical failure`
        );
        break;
      }
    }
  }

  const executionTime = Date.now() - startTime;
  const finalStatus = determineFinalStatusSequential(workflowState, plan);

  console.log(
    `[Orchestra] Execution ${executionId} finished in ${executionTime}ms with status: ${finalStatus}`
  );

  return {
    executionId,
    originalTask: userQuery,
    plan,
    executionSummary: {
      totalSteps: plan.length,
      completedSteps: workflowState.completedSteps.length,
      failedSteps: workflowState.failedSteps.length,
      status: finalStatus,
      executionTime,
    },
    results: workflowState.results,
    failedSteps: workflowState.failedSteps,
    conversationHistory: workflowState.conversationHistory,
  };
}

async function executeStepWithRetry(
  currentStep,
  workflowState,
  userQuery,
  stepId
) {
  const maxRetries = MAX_RETRIES_PER_STEP;
  let retryCount = workflowState.stepRetries.get(currentStep.step) || 0;
  let lastError = null;

  while (retryCount <= maxRetries) {
    try {
      console.log(
        `[Orchestra] Attempting step ${currentStep.step}, attempt ${
          retryCount + 1
        }/${maxRetries + 1}`
      );

      workflowState.stepRetries.set(currentStep.step, retryCount);

      const orchestraResponse = await Promise.race([
        coordinateStepExecution(currentStep, workflowState, userQuery),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Coordination timeout")), 30000)
        ),
      ]);

      const agentResult = await Promise.race([
        executeAgentTaskWithLoopDetection(currentStep, stepId, lastError),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Agent execution timeout")),
            STEP_TIMEOUT
          )
        ),
      ]);

      const processedResult = await processStepResult(
        orchestraResponse,
        agentResult,
        currentStep,
        workflowState
      );

      return processedResult;
    } catch (error) {
      lastError = error;
      retryCount++;
      workflowState.stepRetries.set(currentStep.step, retryCount);

      if (isInfiniteLoopError(error)) {
        console.error(
          `[Orchestra] Infinite loop detected in step ${currentStep.step}:`,
          error.message
        );
        throw new Error(`Infinite loop detected: ${error.message}`);
      }

      console.warn(
        `[Orchestra] Step ${currentStep.step} attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount > maxRetries) {
        throw new Error(
          `Step failed after ${maxRetries + 1} attempts: ${error.message}`
        );
      }

      const waitTime = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
      console.log(`[Orchestra] Waiting ${waitTime}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
}

async function executeAgentTaskWithLoopDetection(step, stepId, lastError) {
  const runner = agentMap[step.agent];
  if (!runner) {
    throw new Error(`Unknown agent: ${step.agent}`);
  }

  console.log(
    `[Orchestra] Delegating to ${step.agent.toUpperCase()} agent (${stepId}): ${
      step.subtask
    }`
  );

  let enhancedSubtask = `[Step ${step.step}] ${step.subtask}`;

  if (lastError && isToolFormattingError(lastError)) {
    enhancedSubtask += `\n\nIMPORTANT: Previous attempt failed due to tool formatting error. 
    Please ensure all tool calls use proper JSON format and avoid infinite retry loops.
    If a tool consistently fails, try an alternative approach or skip that too`;
  }

  const result = await runner(enhancedSubtask, {
    publishResult: false,
    stepId,
    stepNumber: step.step,
    maxToolRetries: 2,
    preventInfiniteLoops: true,
  });

  return {
    stepId,
    agent: step.agent,
    subtask: step.subtask,
    result,
    timestamp: new Date().toISOString(),
  };
}

function determineFinalStatusSequential(workflowState, plan) {
  if (workflowState.failedSteps.length === 0) {
    return "SUCCESS";
  } else if (workflowState.completedSteps.length === 0) {
    return "FAILED";
  } else if (workflowState.completedSteps.length === plan.length) {
    return "SUCCESS_WITH_RECOVERABLE_ERRORS";
  } else {
    return "PARTIAL_SUCCESS";
  }
}

async function coordinateStepExecution(currentStep, workflowState, userQuery) {
  try {
    const context = {
      step: currentStep.step,
      agent: currentStep.agent,
      subtask: currentStep.subtask,
      completedSteps: workflowState.completedSteps,
      failedSteps: workflowState.failedSteps.map((f) => f.step),
      userQuery,
    };

    console.log(
      `[Orchestra] Coordinating step ${currentStep.step} with context:`,
      context
    );

    const promptInput = await orchestraAgentPrompt.format({
      user_task: userQuery,
      step_number: currentStep.step,
      agent_type: currentStep.agent,
      subtask: currentStep.subtask,
      completed_steps: workflowState.completedSteps.join(", ") || "None",
      failed_steps:
        workflowState.failedSteps.map((f) => f.step).join(", ") || "None",
      plan: JSON.stringify(workflowState.plan || [], null, 2),
      deliverables: currentStep.deliverables || "Complete the assigned task",
      context: JSON.stringify(context, null, 2),
      error_prevention: `
        CRITICAL: If tools fail repeatedly with formatting errors, try alternative approaches.
        Avoid infinite retry loops. If a tool fails 2+ times, skip it or use a different method.
        Focus on completing the core task even if some tools are unavailable.
        DO NOT use semantic_code_search or other problematic tools.
      `,
    });

    const response = await llm.invoke(promptInput);
    console.log(
      `[Orchestra] Coordination response for step ${currentStep.step}:`,
      response
    );
    return response;
  } catch (error) {
    console.error("[Orchestra] Coordination failed:", error);
    return `Fallback coordination for step ${currentStep.step}: Execute ${currentStep.subtask} with ${currentStep.agent} agent. 
    AVOID infinite loops - if tools fail repeatedly, try alternative approaches.
    DO NOT use semantic_code_search or other problematic tools.`;
  }
}

async function processStepResult(
  orchestraResponse,
  agentResult,
  step,
  workflowState
) {
  const processed = {
    step: step.step,
    agent: step.agent,
    subtask: step.subtask,
    deliverables: step.deliverables,
    agentResult: agentResult.result,
    orchestraCoordination:
      orchestraResponse.content ||
      orchestraResponse.toString().substring(0, 500),
    status: "SUCCESS",
    timestamp: new Date().toISOString(),
    stepId: agentResult.stepId,
  };

  console.log(`[Orchestra] Step ${step.step} processed successfully`);
  return processed;
}

async function handleStepFailure(error, step, workflowState, plan, userQuery) {
  console.log(
    `[Orchestra] Handling failure for step ${step.step}:`,
    error.message
  );

  if (isInfiniteLoopError(error)) {
    console.error(
      `[Orchestra] Infinite loop detected in step ${step.step}, this is critical`
    );
    return false;
  }

  const hasProgress = workflowState.completedSteps.length > 0;
  const isCriticalStep =
    step.agent === "ops" ||
    step.subtask.toLowerCase().includes("critical") ||
    step.subtask.toLowerCase().includes("essential");
  const remainingSteps = plan.length - workflowState.currentStepIndex - 1;
  const failureRate =
    workflowState.failedSteps.length / (workflowState.currentStepIndex + 1);

  if (isCriticalStep && !hasProgress) {
    console.log("[Orchestra] Critical step failed with no progress, aborting");
    return false;
  }

  if (failureRate > 0.6) {
    console.log("[Orchestra] High failure rate detected, aborting");
    return false;
  }

  if (remainingSteps === 0) {
    console.log("[Orchestra] No remaining steps, completing workflow");
    return false;
  }

  const recentLoopErrors = workflowState.failedSteps
    .slice(-3)
    .filter((f) => isInfiniteLoopError(new Error(f.error)));

  if (recentLoopErrors.length >= 2) {
    console.log("[Orchestra] Multiple infinite loop errors detected, aborting");
    return false;
  }

  console.log("[Orchestra] Continuing with workflow despite failure");
  return true;
}

// Listen for orchestra tasks via pubsub and auto-process
export function subscribeToOrchestraTasks(
  orchestraAgentRunner = runOrchestraAgent
) {
  bus.subscribe("agent.orchestra.task", async (msg) => {
    const requestId = `req_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;

    try {
      console.log(`[OrchestraAgent] Processing message ${requestId}:`, msg);

      const data = msg.data || msg;
      if (!data || !data.userTask) {
        console.error(
          `[OrchestraAgent] Invalid message format for ${requestId}:`,
          msg
        );
        return;
      }

      const { userTask, replyChannel } = data;
      console.log(
        `[OrchestraAgent] Received user task ${requestId}:`,
        userTask
      );

      if (!replyChannel) {
        console.error(
          `[OrchestraAgent] No reply channel provided for ${requestId}`
        );
        return;
      }

      const result = await orchestraAgentRunner(userTask);

      await bus.publish(replyChannel, "ORCHESTRA_RESULT", result);

      console.log(
        `[OrchestraAgent] Successfully published result for ${requestId}!`
      );
    } catch (err) {
      console.error(`[OrchestraAgent] Handler error for ${requestId}:`, err);
      if (msg?.data?.replyChannel) {
        try {
          await bus.publish(msg.data.replyChannel, "ORCHESTRA_ERROR", {
            error: err.message || "Unknown error occurred",
            requestId,
          });
        } catch (publishErr) {
          console.error(
            `[OrchestraAgent] Failed to publish error for ${requestId}:`,
            publishErr
          );
        }
      }
    }
  });
}

// Subscribe to parallel orchestra tasks
export function subscribeToParallelOrchestraTasks() {
  bus.subscribe("agent.orchestra.parallel", async (msg) => {
    const requestId = `parallel_req_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;

    try {
      console.log(`[ParallelOrchestra] Processing message ${requestId}:`, msg);

      const data = msg.data || msg;
      if (!data || !data.userTask) {
        console.error(
          `[ParallelOrchestra] Invalid message format for ${requestId}:`,
          msg
        );
        return;
      }

      const { userTask, sessionId, replyChannel, timeoutMs, options } = data;
      console.log(
        `[ParallelOrchestra] Received user task ${requestId}:`,
        userTask
      );

      if (!replyChannel) {
        console.error(
          `[ParallelOrchestra] No reply channel provided for ${requestId}`
        );
        return;
      }

      const result = await orchestrateParallel(
        userTask,
        sessionId,
        timeoutMs,
        options
      );

      await bus.publish(replyChannel, "PARALLEL_ORCHESTRA_RESULT", result);

      console.log(
        `[ParallelOrchestra] Successfully published result for ${requestId}!`
      );
    } catch (err) {
      console.error(`[ParallelOrchestra] Handler error for ${requestId}:`, err);
      if (msg?.data?.replyChannel) {
        try {
          await bus.publish(msg.data.replyChannel, "PARALLEL_ORCHESTRA_ERROR", {
            error: err.message || "Unknown error occurred",
            requestId,
          });
        } catch (publishErr) {
          console.error(
            `[ParallelOrchestra] Failed to publish error for ${requestId}:`,
            publishErr
          );
        }
      }
    }
  });
}
