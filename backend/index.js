import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import multer from "multer";
// Import agent controllers

import { handleDebugTask } from "./controllers/debugAgentController.js";
import { handleDevAgentTask } from "./controllers/devAgentController.js";
import { handleOpsTask } from "./controllers/opsAgentController.js";
import { handleOrchestraTask } from "./controllers/orchestraController.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const upload = multer({ dest: "uploads/" });

// ROUTES
app.post("/agent/debug", handleDebugTask);
app.post("/agent/dev", handleDevAgentTask);
app.post("/agent/ops", handleOpsTask);
app.post("/agent/orchestra",handleOrchestraTask);

app.get("/test", (req, res) => {
  res.json({ message: "Server is running" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DAIOS Agent Server running on port ${PORT}`);
});
