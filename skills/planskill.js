import { ChatOllama } from "@langchain/ollama";

/**
 * planskill.js
 *
 * Uses an LLM to break down a user query into a step-by-step list of atomic, actionable subtasks.
 * Returns an array of step objects: { agent: string, subtask: string }
 */

const PLANNER_PROMPT = `You are an expert planner.
Break down the following task into a step-by-step, numbered list of atomic, actionable subtasks.
Task: {task}
Subtasks:
1.
`;

const llm = new ChatOllama({
  model: "llama3",
  baseUrl: process.env.OLLAMA_URL || "http://ollama:11434",
  temperature: 0,
});

/**
 * @param {Object} params
 * @param {string} params.user_query - The user's task or query.
 * @param {string} [params.summary_of_conversation]
 * @param {any[]} [params.possible_vague_parts_of_query]
 * @param {number} [params.difficulty_level]
 * @returns {Promise<Array<{agent:string, subtask:string}>>}
 */
export async function planskill({
  user_query,
  summary_of_conversation = "",
  possible_vague_parts_of_query = [],
  difficulty_level = 50,
}) {
  // Format the prompt
  const prompt = PLANNER_PROMPT.replace("{task}", user_query);

  // Call the LLM
  let subtaskLines;
  try {
    const result = await llm.invoke(prompt);
    // result.content if returned by some LLMs, otherwise just result
    const response =
      typeof result === "string" ? result : result?.content ?? "";
    // Parse subtasks: look for lines that start with a number and a dot
    subtaskLines = response
      .split("\n")
      .filter((line) => /^\d+\./.test(line))
      .map((line) => line.replace(/^\d+\.\s*/, "").trim())
      .filter((line) => !!line);
  } catch (e) {
    console.error("[planskill] LLM invocation failed:", e);
    throw e;
  }

  // Assign agents based on subtask content (simple heuristics, customize as needed)
  const agentHeuristics = [
    {
      agent: "dev",
      keywords: ["implement", "write code", "create", "build", "develop"],
    },
    {
      agent: "debug",
      keywords: ["test", "debug", "verify", "inspect", "check"],
    },
    {
      agent: "ops",
      keywords: ["deploy", "docker", "release", "publish", "infrastructure"],
    },
  ];

  function guessAgent(subtask) {
    const lower = subtask.toLowerCase();
    for (const { agent, keywords } of agentHeuristics) {
      if (keywords.some((kw) => lower.includes(kw))) return agent;
    }
    // fallback
    if (lower.includes("test")) return "debug";
    if (lower.includes("deploy")) return "ops";
    return "dev";
  }

  // Return the step objects
  return subtaskLines.map((subtask) => ({
    agent: guessAgent(subtask),
    subtask,
  }));
}
