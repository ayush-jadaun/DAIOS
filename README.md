# DAIOS

**DAIOS** (Distributed AI Operating System) is a cloud-native, multi-agent AI framework designed for rapid prototyping and deployment of intelligent agents. It will support task planning, memory, tool usage, and both local and cloud-hosted LLMs, all containerized for modern AI workflows.

---

## 🚀 Features

- **Multi-agent orchestration**: Run several specialized agents (DevAgent, UXAgent, DebugAgent, etc.) with inter-agent communication.
- **Task planning & execution**: Agents can break down complex tasks, plan subtasks, and coordinate completion.
- **Memory integration**: Persistent vector memory using ChromaDB or other backends for context-aware operation.
- **Tool support**: Web search, file I/O, code analysis, and more via LangChain tools or custom extensions.
- **Local & cloud LLM support**: Seamlessly switch between OpenAI, Ollama, Mistral, and other models.
- **Containerized runtime**: Easily deploy via Docker for repeatable, scalable environments.
- **Dashboard & CLI**: Visualize and control agent activity, memory, and task flows.
- **Decentralization ready**: Early support for IPFS, Ceramic, and P2P identity/messaging.

---

## 📦 Project Structure

```text
/
├── agents/           # Agent logic, roles, and planners
├── controllers/      # API endpoints and orchestrators
├── tools/            # Tool integrations (web search, file I/O, etc.)
├── memory/           # Vector DB and context memory modules
├── runtime/          # Container, scheduler, and agent registry
├── dashboard/        # (Coming soon) Web UI for agents and tasks
├── .env.example      # Example environment configuration
├── docker/           # Dockerfiles and compose setups
├── package.json      # Node.js dependencies and scripts
└── README.md         # Project documentation
```

---

## 🏁 Quickstart

### 1. Clone the repo
```bash
git clone https://github.com/ayush-jadaun/DAIOS.git
cd DAIOS
```

### 2. Set up environment
Copy `.env.example` to `.env` and fill in required fields (OpenAI/Ollama, Chroma, etc).

### 3. Build & run (Docker)
```bash
docker compose up --build
```

### 4. Access the API
- Agents run at: `http://localhost:11434` (Ollama) and your app's API port (see `.env`)
- Dashboard: (coming soon!)

---

## 🧠 Example Usage

- **Single task:**  
  `POST /task` → `{ "input": "Summarize this document…" }`
- **Multi-agent:**  
  `POST /project` → `{ "goal": "Refactor this repo for speed", "agents": ["DevAgent", "DebugAgent"] }`
- **File/code analysis:**  
  `POST /analyze` with file upload

---

## 🔧 Tech Stack

- **Node.js** (LangChainJS, Express)
- **Python** (optional: LangChain, tools)
- **Ollama**, **OpenAI**, **Mistral** (LLMs)
- **ChromaDB** (vector DB)
- **Docker** (containerization)
- **Next.js + Tailwind** (dashboard, coming soon)

---

## 📚 Roadmap

- [x] Agent runtime (Week 1)
- [x] Memory + tools (Week 2)
- [ ] Multi-agent orchestration (Week 3)
- [ ] Dashboard & runtime manager (Week 4)
- [ ] Decentralization, P2P identity (Next phase)

---

