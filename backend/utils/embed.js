import dotenv from "dotenv";
dotenv.config();

const GEMINI_API_KEY = process.env.GOOGLE_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set in environment variables.");
}

export async function getGeminiEmbedding(text) {
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedText?key=" +
    GEMINI_API_KEY;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      taskType: "RETRIEVAL_DOCUMENT",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${err}`);
  }

  const result = await response.json();

  return result.embedding?.values || [];
}
