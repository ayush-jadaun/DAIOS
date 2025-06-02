import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { CohereClient } from "cohere-ai";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

app.post("/agent/task", async (req, res) => {
  const { task } = req.body;
  if (!task) return res.status(400).json({ error: "No task provided" });

  try {
    const response = await runLLMTask(task);
    res.json({ result: response });
  } catch (err) {
    console.error("LLM Error:", err);
    res.status(500).json({ error: "LLM processing failed" });
  }
});

async function runLLMTask(task) {
  const response = await cohere.generate({
    model: "command",
    prompt: task,
    max_tokens: 300,
    temperature: 0.75,
  });

  return response.generations[0].text.trim();
}

app.get("/test", (req, res) => {
  res.json({ message: "Server is running" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DAIOS Agent Server running on port ${PORT}`);
});
