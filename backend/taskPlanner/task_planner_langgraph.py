from langgraph.graph import StateGraph, START, END
from langchain_core.prompts import PromptTemplate
from langchain_ollama.llms import OllamaLLM
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import TypedDict, List

# Define the state schema
class PlannerState(TypedDict):
    task: str
    subtasks: List[str]
    final: bool

# Define the LLM
llm = OllamaLLM(model="llama3", base_url="http://ollama:11434")

# Prompt for subtask breakdown
PLANNER_PROMPT = """You are an expert planner.
Break down the following task into a step-by-step numbered list of atomic, actionable subtasks.
Task: {task}
Subtasks:
1.
"""

def plan_subtasks(task: str) -> List[str]:
    prompt = PromptTemplate.from_template(PLANNER_PROMPT)
    try:
        result = llm.invoke(prompt.format(task=task))
        # result is a string, not an object with .content
        subtasks = [
            s.strip()
            for s in str(result).split('\n')
            if s.strip() and s.strip()[0].isdigit()
        ]
        return subtasks
    except Exception as e:
        print(f"LLM invocation failed: {e}")
        raise

# Define node functions
def entry_node(state: PlannerState) -> PlannerState:
    """Initialize the state with the task"""
    return {
        "task": state["task"],
        "subtasks": [],
        "final": False
    }

def planner_node(state: PlannerState) -> PlannerState:
    """Plan subtasks based on the given task"""
    subtasks = plan_subtasks(state["task"])
    return {
        "task": state["task"],
        "subtasks": subtasks,
        "final": False
    }

def execute_node(state: PlannerState) -> PlannerState:
    """Execute the planned subtasks (currently just returns them)"""
    return {
        "task": state["task"],
        "subtasks": state["subtasks"],
        "final": True
    }

# Build the graph
def create_planner_graph():
    # Initialize graph with state schema
    graph = StateGraph(PlannerState)
    
    # Add nodes
    graph.add_node("entry", entry_node)
    graph.add_node("planner", planner_node)
    graph.add_node("execute", execute_node)
    
    # Add edges
    graph.add_edge(START, "entry")
    graph.add_edge("entry", "planner")
    graph.add_edge("planner", "execute")
    graph.add_edge("execute", END)
    
    # Compile the graph
    return graph.compile()

# Create the compiled graph
compiled_graph = create_planner_graph()

# --- FastAPI Setup ---
app = FastAPI(title="Task Planner API", version="1.0.0")

class TaskRequest(BaseModel):
    task: str

class TaskResponse(BaseModel):
    task: str
    subtasks: List[str]

@app.post("/plan", response_model=TaskResponse)
async def plan_task(request: TaskRequest):
    """Plan a task by breaking it down into subtasks"""
    start_state = {
        "task": request.task,
        "subtasks": [],
        "final": False
    }
    
    try:
        result = compiled_graph.invoke(start_state)
        return TaskResponse(
            task=request.task,
            subtasks=result["subtasks"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Planning failed: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}