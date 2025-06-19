import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

/**
 * Enhanced planskill.js with task complexity analysis to prevent over-planning
 */

// Task complexity analysis prompt
const COMPLEXITY_ANALYSIS_PROMPT = `Analyze this task for complexity and determine if it needs multi-step planning:

TASK: "{task}"

Consider these factors:
1. Is this a simple, single-action task? (like "create hello world", "write a function", "fix this bug")
2. Does it require multiple different types of work? (development + testing + deployment)
3. Does it involve multiple components or systems?
4. Are there clear dependencies between different parts?

COMPLEXITY LEVELS:
- SIMPLE: Single action, one agent can handle completely (1 step)
- MODERATE: Needs 2-3 related steps, possibly involving 2 agents
- COMPLEX: Multi-faceted project requiring 3+ steps across multiple agents

Respond with JSON:
{
  "complexity": "SIMPLE|MODERATE|COMPLEX",
  "reasoning": "Brief explanation",
  "suggested_steps": 1-8,
  "needs_testing": true/false,
  "needs_deployment": true/false
}`;

const SIMPLE_TASK_PROMPT = `You are planning a simple task that should be handled by ONE agent in ONE step.

TASK: {task}

AVAILABLE AGENTS:
- DEV: Code implementation, architecture design, feature development, file creation
- DEBUG: Testing, debugging, code review, error analysis, performance optimization  
- OPS: Deployment, infrastructure, CI/CD, containerization, monitoring

Choose the most appropriate agent and create a single, focused subtask.

OUTPUT FORMAT (JSON):
[
  {
    "step": 1,
    "agent": "DEV|DEBUG|OPS",
    "subtask": "Clear, specific description of what to do",
    "rationale": "Why this agent is best suited",
    "dependencies": [],
    "deliverables": ["What this step should produce"]
  }
]`;

const ENHANCED_PLANNER_PROMPT = `You are an expert software project planner who breaks down complex tasks into actionable subtasks for specialized AI agents.

AVAILABLE AGENTS:
- DEV: Handles code implementation, architecture design, feature development, code analysis, and technical problem-solving
- DEBUG: Specializes in testing, debugging, code review, error analysis, performance optimization, and quality assurance
- OPS: Manages deployment, infrastructure, CI/CD, containerization, monitoring, and operational concerns

TASK TO PLAN: {task}

CONTEXT:
- Conversation Summary: {summary}
- Difficulty Level: {difficulty}/100
- Potential Ambiguities: {vague_parts}
- Task Complexity: {complexity}
- Needs Testing: {needs_testing}
- Needs Deployment: {needs_deployment}

PLANNING REQUIREMENTS:
1. Break the task into {suggested_steps} atomic, sequential subtasks
2. Each subtask should be completable by a single agent
3. Assign the most appropriate agent (DEV/DEBUG/OPS) for each subtask
4. Consider dependencies between subtasks
5. Be specific and actionable in subtask descriptions
6. Only include testing if explicitly needed or requested
7. Only include deployment/ops if explicitly needed or requested

OUTPUT FORMAT (JSON):
[
  {
    "step": 1,
    "agent": "DEV|DEBUG|OPS",
    "subtask": "Specific, actionable description",
    "rationale": "Why this agent is best suited",
    "dependencies": ["step numbers this depends on"],
    "deliverables": ["What this step should produce"]
  }
]

Generate the plan now:`;

// Gemini LLM instance
const llm = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
  model: "models/gemini-2.0-flash",
  temperature: 0.1,
});

/**
 * Enhanced planskill function with complexity analysis
 */
export async function planskill({
  user_query,
  summary_of_conversation = "",
  possible_vague_parts_of_query = [],
  difficulty_level = 50,
}) {
  try {
    console.log("[planskill] Planning task:", user_query);

    // Step 1: Analyze task complexity
    const complexityAnalysis = await analyzeTaskComplexity(user_query);
    console.log("[planskill] Complexity analysis:", complexityAnalysis);

    // Step 2: Generate appropriate plan based on complexity
    let planSteps;
    if (complexityAnalysis.complexity === "SIMPLE") {
      planSteps = await generateSimplePlan(user_query);
    } else {
      planSteps = await generateComplexPlan(
        user_query,
        summary_of_conversation,
        possible_vague_parts_of_query,
        difficulty_level,
        complexityAnalysis
      );
    }

    // Step 3: Validate and enhance the plan
    const validatedPlan = await validateAndEnhancePlan(planSteps, user_query);

    console.log("[planskill] Final plan:", validatedPlan);
    return validatedPlan;
  } catch (error) {
    console.error("[planskill] Planning failed:", error);
    // Fallback to simple planning
    return await simpleFallbackPlan(user_query);
  }
}

/**
 * Analyze task complexity to determine planning approach
 */
async function analyzeTaskComplexity(userQuery) {
  try {
    const prompt = COMPLEXITY_ANALYSIS_PROMPT.replace("{task}", userQuery);
    const result = await llm.invoke(prompt);
    const response =
      typeof result === "string" ? result : result?.content ?? "";

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      return {
        complexity: analysis.complexity || "MODERATE",
        reasoning: analysis.reasoning || "Default analysis",
        suggested_steps: analysis.suggested_steps || 2,
        needs_testing: analysis.needs_testing || false,
        needs_deployment: analysis.needs_deployment || false,
      };
    }
  } catch (error) {
    console.warn("[planskill] Complexity analysis failed:", error);
  }

  // Fallback heuristic analysis
  return analyzeComplexityHeuristic(userQuery);
}

/**
 * Heuristic-based complexity analysis fallback
 */
function analyzeComplexityHeuristic(userQuery) {
  const lower = userQuery.toLowerCase();

  // Simple task indicators
  const simpleIndicators = [
    "create hello world",
    "write a simple",
    "make a basic",
    "generate a",
    "create a file",
    "write hello world",
    "simple function",
    "basic script",
    "quick example",
    "show me how",
    "demonstrate",
  ];

  // Complex task indicators
  const complexIndicators = [
    "full application",
    "complete system",
    "entire project",
    "end-to-end",
    "production ready",
    "deploy",
    "ci/cd",
    "docker",
    "test suite",
    "comprehensive",
    "scalable",
    "microservice",
    "api with tests",
    "full stack",
  ];

  // Check for simple patterns
  if (simpleIndicators.some((indicator) => lower.includes(indicator))) {
    return {
      complexity: "SIMPLE",
      reasoning: "Simple task pattern detected",
      suggested_steps: 1,
      needs_testing: false,
      needs_deployment: false,
    };
  }

  // Check for complex patterns
  if (complexIndicators.some((indicator) => lower.includes(indicator))) {
    return {
      complexity: "COMPLEX",
      reasoning: "Complex task pattern detected",
      suggested_steps: 4,
      needs_testing: true,
      needs_deployment: true,
    };
  }

  // Check if testing is explicitly mentioned
  const needsTesting =
    lower.includes("test") ||
    lower.includes("verify") ||
    lower.includes("validate");

  // Check if deployment is explicitly mentioned
  const needsDeployment =
    lower.includes("deploy") ||
    lower.includes("docker") ||
    lower.includes("container");

  return {
    complexity: "MODERATE",
    reasoning: "Moderate complexity assumed",
    suggested_steps:
      needsTesting && needsDeployment
        ? 3
        : needsTesting || needsDeployment
        ? 2
        : 1,
    needs_testing: needsTesting,
    needs_deployment: needsDeployment,
  };
}

/**
 * Generate simple plan for basic tasks
 */
async function generateSimplePlan(userQuery) {
  try {
    const prompt = SIMPLE_TASK_PROMPT.replace("{task}", userQuery);
    const result = await llm.invoke(prompt);
    const response =
      typeof result === "string" ? result : result?.content ?? "";

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.warn("[planskill] Simple plan generation failed:", error);
  }

  // Fallback simple plan
  return [
    {
      step: 1,
      agent: guessAgentFallback(userQuery),
      subtask: userQuery,
      rationale: "Single step execution",
      dependencies: [],
      deliverables: ["Completed task output"],
    },
  ];
}

/**
 * Generate complex plan for multi-step tasks
 */
async function generateComplexPlan(
  userQuery,
  summary,
  vagueParts,
  difficulty,
  complexityAnalysis
) {
  try {
    const prompt = ENHANCED_PLANNER_PROMPT.replace("{task}", userQuery)
      .replace("{summary}", summary || "None")
      .replace("{difficulty}", difficulty)
      .replace(
        "{vague_parts}",
        vagueParts.length > 0 ? vagueParts.join(", ") : "None"
      )
      .replace("{complexity}", complexityAnalysis.complexity)
      .replace("{suggested_steps}", complexityAnalysis.suggested_steps)
      .replace("{needs_testing}", complexityAnalysis.needs_testing)
      .replace("{needs_deployment}", complexityAnalysis.needs_deployment);

    const result = await llm.invoke(prompt);
    const response =
      typeof result === "string" ? result : result?.content ?? "";

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.warn("[planskill] Complex plan generation failed:", error);
  }

  // Fallback to heuristic planning
  return generateHeuristicPlan(userQuery, complexityAnalysis);
}

/**
 * Generate plan using heuristics
 */
function generateHeuristicPlan(userQuery, complexityAnalysis) {
  const steps = [];

  // Always start with the main development task
  steps.push({
    step: 1,
    agent: "dev",
    subtask: userQuery,
    rationale: "Main implementation task",
    dependencies: [],
    deliverables: ["Implementation output"],
  });

  // Only add testing if explicitly needed
  if (complexityAnalysis.needs_testing) {
    steps.push({
      step: 2,
      agent: "debug",
      subtask: `Test and verify the implementation`,
      rationale: "Quality assurance",
      dependencies: [1],
      deliverables: ["Test results"],
    });
  }

  // Only add deployment if explicitly needed
  if (complexityAnalysis.needs_deployment) {
    steps.push({
      step: steps.length + 1,
      agent: "ops",
      subtask: `Deploy and configure the solution`,
      rationale: "Deployment and operations",
      dependencies: [steps.length],
      deliverables: ["Deployed solution"],
    });
  }

  return steps;
}

// Rest of the helper functions remain the same...
async function validateAndEnhancePlan(planSteps, userQuery) {
  if (!Array.isArray(planSteps) || planSteps.length === 0) {
    throw new Error("Invalid plan structure");
  }

  return planSteps.map((step, index) => ({
    step: step.step || index + 1,
    agent: validateAgent(step.agent) || guessAgentFallback(step.subtask || ""),
    subtask: step.subtask || `Step ${index + 1}`,
    rationale: step.rationale || "No rationale provided",
    dependencies: Array.isArray(step.dependencies) ? step.dependencies : [],
    deliverables: Array.isArray(step.deliverables)
      ? step.deliverables
      : [`Output from step ${index + 1}`],
  }));
}

function validateAgent(agent) {
  const validAgents = ["dev", "debug", "ops", "DEV", "DEBUG", "OPS"];
  return validAgents.includes(agent) ? agent.toLowerCase() : null;
}

function guessAgentFallback(subtask) {
  const lower = subtask.toLowerCase();
  const devPatterns = [
    "implement",
    "code",
    "develop",
    "create",
    "build",
    "write",
    "design",
    "api",
    "function",
    "class",
    "method",
    "algorithm",
    "feature",
    "component",
    "hello world",
    "file",
    "script",
    "program",
  ];
  const debugPatterns = [
    "test",
    "debug",
    "verify",
    "validate",
    "check",
    "review",
    "analyze",
    "fix",
    "error",
    "bug",
    "performance",
    "optimize",
    "quality",
  ];
  const opsPatterns = [
    "deploy",
    "docker",
    "container",
    "infrastructure",
    "ci/cd",
    "pipeline",
    "release",
    "publish",
    "monitor",
    "scale",
    "security",
    "environment",
  ];

  if (debugPatterns.some((pattern) => lower.includes(pattern))) return "debug";
  if (opsPatterns.some((pattern) => lower.includes(pattern))) return "ops";
  return "dev"; // Default to dev for most tasks
}

async function simpleFallbackPlan(userQuery) {
  console.log("[planskill] Using simple fallback plan");
  return [
    {
      step: 1,
      agent: guessAgentFallback(userQuery),
      subtask: userQuery,
      rationale: "Fallback single-step task",
      dependencies: [],
      deliverables: ["Task completion"],
    },
  ];
}
