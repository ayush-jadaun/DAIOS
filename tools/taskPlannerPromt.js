// ESM module: exports a function that returns the planning prompt
export function plannerPrompt(task) {
  return `
  You are an expert project planner. 
  Given a complex task, break it down into a step-by-step numbered list of clear, actionable subtasks that together accomplish the user's goal.
  Subtasks must be as atomic as possible and suitable for automated execution by tools.
  
  Task: ${task}
  
  Subtasks:
  1.
  `;
}
