import { DynamicTool } from "@langchain/core/tools";
import axios from "axios";

export const prIssueManagerTool = new DynamicTool({
  name: "pr_issue_manager",
  description:
    "Create or update pull requests or issues via GitHub API. Input should be a JSON object with: action ('create_pr', 'create_issue', 'update_issue', 'update_pr'), repo (repo name or 'owner/repo'), and action-specific fields. Only repositories owned by ayush-jadaun are supported.",
  func: async (inputJSON) => {
    console.log("[PR_ISSUE_MANAGER] Tool called with input:", inputJSON);

    try {
      let parsedInput;

      // Parse JSON input - handle both string and object inputs
      if (typeof inputJSON === "string") {
        try {
          parsedInput = JSON.parse(inputJSON);
        } catch (parseError) {
          const errorMsg = `Failed to parse input JSON: ${parseError.message}. Input was: ${inputJSON}`;
          console.error("[PR_ISSUE_MANAGER]", errorMsg);
          return { error: errorMsg, success: false };
        }
      } else if (typeof inputJSON === "object" && inputJSON !== null) {
        parsedInput = inputJSON;
      } else {
        const errorMsg = `Invalid input type. Expected JSON string or object, got: ${typeof inputJSON}`;
        console.error("[PR_ISSUE_MANAGER]", errorMsg);
        return { error: errorMsg, success: false };
      }

      const { action, repo, title, body, number, base, head, extra } =
        parsedInput;

      // Validate required fields
      const validActions = [
        "create_pr",
        "create_issue",
        "update_issue",
        "update_pr",
      ];
      if (!action || !validActions.includes(action)) {
        const errorMsg = `Missing or invalid required field: action. Must be one of: ${validActions.join(
          ", "
        )}`;
        console.error("[PR_ISSUE_MANAGER]", errorMsg);
        return { error: errorMsg, success: false };
      }

      if (!repo || typeof repo !== "string" || repo.trim() === "") {
        const errorMsg =
          "Missing or invalid required field: repo (must be 'repo' or 'owner/repo')";
        console.error("[PR_ISSUE_MANAGER]", errorMsg);
        return { error: errorMsg, success: false };
      }

      // Parse repository name and validate owner
      let owner = "ayush-jadaun";
      let reponame = "";

      if (repo.includes("/")) {
        const parts = repo.split("/");
        if (parts.length !== 2) {
          const errorMsg = "Invalid repo format. Use 'repo' or 'owner/repo'";
          console.error("[PR_ISSUE_MANAGER]", errorMsg);
          return { error: errorMsg, success: false };
        }
        const [inputOwner, inputRepo] = parts;
        if (inputOwner !== "ayush-jadaun") {
          const errorMsg =
            "Error: Only repositories owned by ayush-jadaun are supported.";
          console.error("[PR_ISSUE_MANAGER]", errorMsg);
          return { error: errorMsg, success: false };
        }
        reponame = inputRepo;
      } else {
        reponame = repo;
      }

      if (!reponame || reponame.trim() === "") {
        const errorMsg = "Repository name cannot be empty";
        console.error("[PR_ISSUE_MANAGER]", errorMsg);
        return { error: errorMsg, success: false };
      }

      // Validate GitHub token
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        const errorMsg = "GITHUB_TOKEN not set in environment.";
        console.error("[PR_ISSUE_MANAGER]", errorMsg);
        return { error: errorMsg, success: false };
      }

      // Validate action-specific required fields
      if (action === "create_issue") {
        if (!title || typeof title !== "string" || title.trim() === "") {
          const errorMsg =
            "Missing or invalid required field: title for create_issue";
          console.error("[PR_ISSUE_MANAGER]", errorMsg);
          return { error: errorMsg, success: false };
        }
      } else if (action === "update_issue") {
        if (!number || typeof number !== "number" || number <= 0) {
          const errorMsg =
            "Missing or invalid required field: number for update_issue (must be positive integer)";
          console.error("[PR_ISSUE_MANAGER]", errorMsg);
          return { error: errorMsg, success: false };
        }
      } else if (action === "create_pr") {
        const requiredFields = { title, base, head };
        for (const [field, value] of Object.entries(requiredFields)) {
          if (!value || typeof value !== "string" || value.trim() === "") {
            const errorMsg = `Missing or invalid required field: ${field} for create_pr`;
            console.error("[PR_ISSUE_MANAGER]", errorMsg);
            return { error: errorMsg, success: false };
          }
        }
      } else if (action === "update_pr") {
        if (!number || typeof number !== "number" || number <= 0) {
          const errorMsg =
            "Missing or invalid required field: number for update_pr (must be positive integer)";
          console.error("[PR_ISSUE_MANAGER]", errorMsg);
          return { error: errorMsg, success: false };
        }
      }

      const api = "https://api.github.com";
      const headers = {
        Authorization: `token ${token}`,
        "User-Agent": "DAIOS-PR-Issue-Manager",
        Accept: "application/vnd.github.v3+json",
      };

      let res;
      let endpoint;
      let payload = {};

      // Build payload and endpoint based on action
      switch (action) {
        case "create_issue":
          endpoint = `${api}/repos/${owner}/${reponame}/issues`;
          payload = { title, body: body || "", ...(extra || {}) };
          break;

        case "update_issue":
          endpoint = `${api}/repos/${owner}/${reponame}/issues/${number}`;
          payload = {
            ...(title && { title }),
            ...(body !== undefined && { body }),
            ...(extra || {}),
          };
          break;

        case "create_pr":
          endpoint = `${api}/repos/${owner}/${reponame}/pulls`;
          payload = { title, body: body || "", base, head, ...(extra || {}) };
          break;

        case "update_pr":
          endpoint = `${api}/repos/${owner}/${reponame}/pulls/${number}`;
          payload = {
            ...(title && { title }),
            ...(body !== undefined && { body }),
            ...(extra || {}),
          };
          break;
      }

      console.log(
        `[PR_ISSUE_MANAGER] Making ${
          action.includes("create") ? "POST" : "PATCH"
        } request to:`,
        endpoint
      );
      console.log(
        `[PR_ISSUE_MANAGER] Payload:`,
        JSON.stringify(payload, null, 2)
      );

      // Make the API request
      if (action.includes("create")) {
        res = await axios.post(endpoint, payload, { headers });
      } else {
        res = await axios.patch(endpoint, payload, { headers });
      }

      console.log(
        `[PR_ISSUE_MANAGER] Success! ${action} completed for ${owner}/${reponame}`
      );

      // Return structured response with success indicator
      return {
        success: true,
        action,
        repo: `${owner}/${reponame}`,
        id: res.data.id,
        number: res.data.number,
        html_url: res.data.html_url,
        state: res.data.state,
        title: res.data.title,
        created_at: res.data.created_at,
        updated_at: res.data.updated_at,
        ...(action.includes("pr") && {
          mergeable: res.data.mergeable,
          merged: res.data.merged,
        }),
        message: `${action.replace("_", " ")} completed successfully`,
      };
    } catch (err) {
      let errorMsg = `Failed to perform ${
        parsedInput?.action || "unknown"
      } action: ${err.message}`;

      if (err.response) {
        const status = err.response.status;
        const statusText = err.response.statusText;
        let details = "";

        if (err.response.data) {
          if (err.response.data.message) {
            details = err.response.data.message;
          } else if (err.response.data.errors) {
            details = err.response.data.errors
              .map((e) => e.message || e)
              .join(", ");
          }
        }

        errorMsg = `GitHub API request failed (${status} ${statusText})${
          details ? `: ${details}` : ""
        }`;

        // Add helpful context for common errors
        if (status === 404) {
          errorMsg +=
            ". Check if the repository exists and you have access to it.";
        } else if (status === 401) {
          errorMsg +=
            ". Check if your GitHub token is valid and has the required permissions.";
        } else if (status === 422) {
          errorMsg += ". Check if all required fields are provided and valid.";
        }
      }

      console.error("[PR_ISSUE_MANAGER] Error:", errorMsg);
      console.error("[PR_ISSUE_MANAGER] Full error:", err);

      return {
        error: errorMsg,
        success: false,
        action: parsedInput?.action,
        repo: parsedInput?.repo,
      };
    }
  },
});
