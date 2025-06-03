import { CohereClient } from "cohere-ai";
import dotenv from "dotenv"
dotenv.config()
const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

export async function getEmbedding(text) {
  const res = await cohere.embed({
    model: "embed-english-v3.0",
    input_type: "search_document",
    texts: [text],
  });
  return res.embeddings[0];
}
