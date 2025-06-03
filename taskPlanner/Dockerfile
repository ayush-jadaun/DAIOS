FROM python:3.10-slim

WORKDIR /app

# Install build tools (optional but recommended for Python C extensions)
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

# Copy the FastAPI LangGraph task planner code
COPY task_planner_langgraph.py /app/task_planner_langgraph.py

# Install dependencies for the task planner
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    pydantic \
    langgraph \
    langchain-core \
    langchain-ollama \
    typing-extensions

EXPOSE 8002

CMD ["uvicorn", "task_planner_langgraph:app", "--host", "0.0.0.0", "--port", "8002"]