import { DynamicTool } from "@langchain/core/tools";
import axios from "axios";

export const prIssueManagerTool = new DynamicTool({
  name: "pr_issue_manager",
  description:
    "Create or update pull requests or issues via GitHub API. Input should be a JSON object or string with: action ('create_pr', 'create_issue', 'update_issue', 'update_pr'), repo (owner/repo), title, body, and optional params.",
  func: async (inputJSON) => {
    console.log("[PR_ISSUE_MANAGER] Tool called with input:", inputJSON);

    try {
      let parsedInput;

      // Parse JSON input
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          const errorMsg = `Failed to parse input JSON: ${parseError.message}. Input was: ${inputJSON}`;
          console.error("[PR_ISSUE_MANAGER]", errorMsg);
          return errorMsg;
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        const errorMsg = `Invalid input type. Expected JSON string or object, got: ${typeof inputJSON}`;
        console.error("[PR_ISSUE_MANAGER]", errorMsg);
        return errorMsg;
      }

      const { action, repo, title, body, number, base, head, extra } =
        parsedInput;

      // Validate required fields
      if (
        !action ||
        !["create_pr", "create_issue", "update_issue", "update_pr"].includes(
          action
        )
      ) {
        const errorMsg = "Missing or invalid required field: action";
        console.error("[PR_ISSUE_MANAGER]", errorMsg);
        return errorMsg;
      }
      if (!repo || typeof repo !== "string" || !repo.includes("/")) {
        const errorMsg =
          "Missing or invalid required field: repo (must be 'owner/repo')";
        console.error("[PR_ISSUE_MANAGER]", errorMsg);
        return errorMsg;
      }
      const [owner, reponame] = repo.split("/");
      const api = "https://api.github.com";
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        const errorMsg = "GITHUB_TOKEN not set in environment.";
        console.error("[PR_ISSUE_MANAGER]", errorMsg);
        return { error: errorMsg };
      }

      let res;

      if (action === "create_issue") {
        if (!title) return "Missing required field: title for create_issue";
        res = await axios.post(
          `${api}/repos/${owner}/${reponame}/issues`,
          { title, body, ...(extra || {}) },
          { headers: { Authorization: `token ${token}` } }
        );
      } else if (action === "update_issue") {
        if (!number) return "Missing required field: number for update_issue";
        res = await axios.patch(
          `${api}/repos/${owner}/${reponame}/issues/${number}`,
          { title, body, ...(extra || {}) },
          { headers: { Authorization: `token ${token}` } }
        );
      } else if (action === "create_pr") {
        if (!title || !base || !head)
          return "Missing required field: title, base, or head for create_pr";
        res = await axios.post(
          `${api}/repos/${owner}/${reponame}/pulls`,
          { title, body, base, head, ...(extra || {}) },
          { headers: { Authorization: `token ${token}` } }
        );
      } else if (action === "update_pr") {
        if (!number) return "Missing required field: number for update_pr";
        res = await axios.patch(
          `${api}/repos/${owner}/${reponame}/pulls/${number}`,
          { title, body, ...(extra || {}) },
          { headers: { Authorization: `token ${token}` } }
        );
      } else {
        return { error: "Invalid action" };
      }

      return res.data;
    } catch (err) {
      const errorMsg = `Failed to perform PR/issue action: ${err.message}`;
      console.error("[PR_ISSUE_MANAGER] Error:", errorMsg);
      return { error: errorMsg };
    }
  },
});
