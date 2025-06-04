import { DynamicStructuredTool } from "@langchain/core/tools";
import axios from "axios";

export const prIssueManagerTool = new DynamicStructuredTool({
  name: "pr_issue_manager",
  description:
    "Create or update pull requests or issues via GitHub API. Input: action ('create_pr', 'create_issue', 'update_issue', 'update_pr'), repo (owner/repo), title, body, and optional params.",
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create_pr", "create_issue", "update_issue", "update_pr"],
        description: "Action to perform.",
      },
      repo: {
        type: "string",
        description: "Repository in 'owner/repo' format.",
      },
      title: { type: "string", description: "Title for PR/Issue." },
      body: { type: "string", description: "Body/description." },
      number: {
        type: "number",
        description: "Issue or PR number (for update actions).",
      },
      base: { type: "string", description: "Base branch (for PR creation)." },
      head: { type: "string", description: "Head branch (for PR creation)." },
      extra: { type: "object", description: "Extra params as needed." },
    },
    required: ["action", "repo"],
  },
  func: async ({ action, repo, title, body, number, base, head, extra }) => {
    // You must set your GITHUB_TOKEN in the environment
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { error: "GITHUB_TOKEN not set" };
    const [owner, reponame] = repo.split("/");
    const api = "https://api.github.com";
    try {
      let res;
      if (action === "create_issue") {
        res = await axios.post(
          `${api}/repos/${owner}/${reponame}/issues`,
          {
            title,
            body,
            ...extra,
          },
          { headers: { Authorization: `token ${token}` } }
        );
      } else if (action === "update_issue") {
        res = await axios.patch(
          `${api}/repos/${owner}/${reponame}/issues/${number}`,
          {
            title,
            body,
            ...extra,
          },
          { headers: { Authorization: `token ${token}` } }
        );
      } else if (action === "create_pr") {
        res = await axios.post(
          `${api}/repos/${owner}/${reponame}/pulls`,
          {
            title,
            body,
            base,
            head,
            ...extra,
          },
          { headers: { Authorization: `token ${token}` } }
        );
      } else if (action === "update_pr") {
        res = await axios.patch(
          `${api}/repos/${owner}/${reponame}/pulls/${number}`,
          {
            title,
            body,
            ...extra,
          },
          { headers: { Authorization: `token ${token}` } }
        );
      } else {
        return { error: "Invalid action" };
      }
      return res.data;
    } catch (err) {
      return { error: "Failed to perform PR/issue action: " + err.message };
    }
  },
});
