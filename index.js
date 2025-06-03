import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";

import { handleTaskRequest } from "./controllers/agentController.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

app.post("/agent/task", handleTaskRequest);

app.get("/test", (req, res) => {
  res.json({ message: "Server is running" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DAIOS Agent Server running on port ${PORT}`);
});
