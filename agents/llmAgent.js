import { CohereClient } from "cohere-ai";

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

export async function runLLMTask(task) {
  const response = await cohere.chat({
    model: "command",
    message: task,
    max_tokens: 300,
    temperature: 0.75,
  });

  return response.text.trim();
}
