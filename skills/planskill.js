import { ChatOllama } from "@langchain/ollama";

/**
 * Enhanced planskill.js with better prompting and agent assignment
 */

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

PLANNING REQUIREMENTS:
1. Break the task into 3-8 atomic, sequential subtasks
2. Each subtask should be completable by a single agent
3. Assign the most appropriate agent (DEV/DEBUG/OPS) for each subtask
4. Consider dependencies between subtasks
5. Be specific and actionable in subtask descriptions
6. Include verification/testing steps where appropriate

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

const AGENT_ASSIGNMENT_PROMPT = `Given this subtask: "{subtask}"

AGENT CAPABILITIES:
- DEV: Code implementation, architecture, feature development, technical design, API creation, database design
- DEBUG: Testing, debugging, code review, performance analysis, error handling, quality assurance, validation
- OPS: Deployment, infrastructure, CI/CD, containerization, monitoring, security, scaling, environment management

Which agent should handle this subtask and why?

Respond with JSON:
{
  "agent": "DEV|DEBUG|OPS",
  "confidence": 0.0-1.0,
  "rationale": "Brief explanation"
}`;

const llm = new ChatOllama({
  model: "llama3",
  baseUrl: process.env.OLLAMA_URL || "http://ollama:11434",
  temperature: 0.1, // Slightly higher for more creative planning
});

/**
 * Enhanced planskill function with better prompting and validation
 */
export async function planskill({
  user_query,
  summary_of_conversation = "",
  possible_vague_parts_of_query = [],
  difficulty_level = 50,
}) {
  try {
    console.log("[planskill] Planning task:", user_query);

    // Format the enhanced prompt
    const prompt = ENHANCED_PLANNER_PROMPT.replace("{task}", user_query)
      .replace("{summary}", summary_of_conversation || "None")
      .replace("{difficulty}", difficulty_level)
      .replace(
        "{vague_parts}",
        possible_vague_parts_of_query.length > 0
          ? possible_vague_parts_of_query.join(", ")
          : "None"
      );

    // Get the plan from LLM
    const result = await llm.invoke(prompt);
    const response =
      typeof result === "string" ? result : result?.content ?? "";

    console.log("[planskill] Raw LLM response:", response);

    // Try to parse JSON response
    let planSteps;
    try {
      // Extract JSON from response (handle cases where LLM adds extra text)
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        planSteps = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON array found in response");
      }
    } catch (parseError) {
      console.warn(
        "[planskill] JSON parsing failed, falling back to text parsing"
      );
      planSteps = await fallbackTextParsing(response, user_query);
    }

    // Validate and enhance the plan
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
 * Fallback text parsing when JSON parsing fails
 */
async function fallbackTextParsing(response, userQuery) {
  const lines = response.split("\n").filter((line) => line.trim());
  const steps = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for numbered steps or bullet points
    const stepMatch = line.match(/^(\d+\.|\*|\-)\s*(.+)/);
    if (stepMatch) {
      const subtask = stepMatch[2].trim();
      if (subtask.length > 10) {
        // Ignore very short lines
        // Use enhanced agent assignment
        const assignment = await assignAgentWithLLM(subtask);
        steps.push({
          step: steps.length + 1,
          agent: assignment.agent,
          subtask: subtask,
          rationale: assignment.rationale,
          dependencies: [],
          deliverables: [`Output from: ${subtask}`],
        });
      }
    }
  }

  return steps.length > 0 ? steps : await simpleFallbackPlan(userQuery);
}

/**
 * Use LLM to assign agent for a specific subtask
 */
async function assignAgentWithLLM(subtask) {
  try {
    const prompt = AGENT_ASSIGNMENT_PROMPT.replace("{subtask}", subtask);
    const result = await llm.invoke(prompt);
    const response =
      typeof result === "string" ? result : result?.content ?? "";

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const assignment = JSON.parse(jsonMatch[0]);
      return {
        agent: assignment.agent || guessAgentFallback(subtask),
        rationale: assignment.rationale || "LLM assignment",
      };
    }
  } catch (error) {
    console.warn("[planskill] LLM agent assignment failed:", error);
  }

  return {
    agent: guessAgentFallback(subtask),
    rationale: "Fallback heuristic assignment",
  };
}

/**
 * Validate and enhance the generated plan
 */
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

/**
 * Validate agent name
 */
function validateAgent(agent) {
  const validAgents = ["dev", "debug", "ops", "DEV", "DEBUG", "OPS"];
  return validAgents.includes(agent) ? agent.toLowerCase() : null;
}

/**
 * Enhanced fallback agent assignment with better heuristics
 */
function guessAgentFallback(subtask) {
  const lower = subtask.toLowerCase();

  // Development patterns
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
  ];

  // Debug/test patterns
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

  // Ops patterns
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
  if (devPatterns.some((pattern) => lower.includes(pattern))) return "dev";

  // Default based on task complexity indicators
  if (lower.includes("setup") || lower.includes("configure")) return "ops";
  if (lower.includes("ensure") || lower.includes("verify")) return "debug";

  return "dev"; // Default fallback
}

/**
 * Simple fallback plan when all else fails
 */
async function simpleFallbackPlan(userQuery) {
  console.log("[planskill] Using simple fallback plan");

  return [
    {
      step: 1,
      agent: "dev",
      subtask: `Analyze and implement: ${userQuery}`,
      rationale: "Fallback development task",
      dependencies: [],
      deliverables: ["Implementation or analysis results"],
    },
    {
      step: 2,
      agent: "debug",
      subtask: `Test and verify the implementation`,
      rationale: "Ensure quality and correctness",
      dependencies: [1],
      deliverables: ["Test results and validation"],
    },
  ];
}
