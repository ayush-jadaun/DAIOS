import axios from "axios";
const CHROMA_BRIDGE_URL =
  process.env.CHROMA_BRIDGE_URL || "http://chroma-service:8001";

// Add document
export async function addToMemory(collectionName, id, text, metadata = {}) {
  await axios.post(`${CHROMA_BRIDGE_URL}/add`, {
    collection: collectionName,
    documents: [text],
    metadatas: [metadata],
    ids: [id],
  });
}

// Query collection
export async function queryMemory(collectionName, queryText, topK = 3) {
  const response = await axios.post(`${CHROMA_BRIDGE_URL}/query`, {
    collection: collectionName,
    query_texts: [queryText],
    n_results: topK,
  });
  // Adapt results as needed
  return response.data;
}
