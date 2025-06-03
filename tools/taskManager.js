import {planSubtasks} from "./taskPlanner.js";
import { runLangchainAgent } from "./langchainAgent.js";

export async function solveComplexTask(task) {
    console.log("Planning subtasks...");
    const subtasks = await planSubtasks(task);
    console.log("Subtasks:", subtasks);

    let results = [];
    for (let i = 0; i < subtasks.length; i++) {
        const subtask = subtasks[i];
        console.log(`---\nSolving subtask ${i + 1}: ${subtask}`);
        const result = await runLangchainAgent(subtask);
        results.push({ subtask, result });
    }
    return results;
}