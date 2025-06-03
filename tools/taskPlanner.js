import { plannerPrompt } from "./taskPlannerPromt.js";
import { ChatOllama } from "@langchain/ollama";

const plannerLLM = new ChatOllama({
    model: "llama3",
    baseUrl: process.env.OLLAMA_URL || "http://ollama:11434",
    temperature: 0,
});

export async function planSubtasks(task) {
    const prompt = plannerPrompt(task);
    const result = await plannerLLM.invoke(prompt);

    // Parse LLM output (handles "1. ...\n2. ...")
    const subtasks = result.content
        .split(/\n\d+\.\s*/)
        .map((s) => s.trim())
        .filter(Boolean);

    return subtasks;
}
