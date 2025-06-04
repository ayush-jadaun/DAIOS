import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import multer from "multer";

import {
  handleTaskRequest,
  handleFileUpload,
  handleLangchainTask
} from "./controllers/agentController.js";
import { handleDebugTask } from "./controllers/debugAgentController.js";
import { handleDevAgentTask } from "./controllers/devAgentController.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const upload = multer({ dest: "uploads/" });

// ROUTES
app.post("/agent/task", handleTaskRequest);
app.post("/agent/upload", upload.single("file"), handleFileUpload);
app.post("/agent/langchain-task",handleLangchainTask);
app.post("/agent/debug",handleDebugTask);
app.post("/agent/dev",handleDevAgentTask);


app.get("/test", (req, res) => {
  res.json({ message: "Server is running" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DAIOS Agent Server running on port ${PORT}`);
});
