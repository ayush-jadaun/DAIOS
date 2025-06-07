import { DynamicTool } from "@langchain/core/tools";
import axios from "axios";

export const prIssueManagerTool = new DynamicTool({
  name: "pr_issue_manager",
  description:
    "Comprehensive GitHub PR and Issue management tool. Supports: list_issues, list_prs, get_issue, get_pr, create_issue, create_pr, update_issue, update_pr, close_issue, close_pr, reopen_issue, reopen_pr, merge_pr, add_comment, list_comments, add_labels, remove_labels, assign_user, unassign_user. Input should be a JSON object with action and repo (owner/repo format). For actions requiring issue/PR numbers, use 'number', 'issue_number', or 'pr_number'. Only repositories owned by ayush-jadaun are supported.",
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

      const {
        action,
        repo,
        title,
        body,
        number,
        base,
        head,
        extra,
        state,
        labels,
        assignees,
        milestone,
        sort,
        direction,
        per_page,
        page,
        since,
        comment_body,
        merge_method,
        commit_title,
        commit_message,
        sha,
        // Alternative parameter names for flexibility
        issue_number,
        pr_number,
        pull_number,
      } = parsedInput;

      // Normalize number parameter - accept multiple formats
      const normalizedNumber =
        number || issue_number || pr_number || pull_number;

      // Validate required fields
      const validActions = [
        "list_issues",
        "list_prs",
        "get_issue",
        "get_pr",
        "create_issue",
        "create_pr",
        "update_issue",
        "update_pr",
        "close_issue",
        "close_pr",
        "reopen_issue",
        "reopen_pr",
        "merge_pr",
        "add_comment",
        "list_comments",
        "add_labels",
        "remove_labels",
        "assign_user",
        "unassign_user",
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
      const actionsRequiringNumber = [
        "get_issue",
        "get_pr",
        "update_issue",
        "update_pr",
        "close_issue",
        "close_pr",
        "reopen_issue",
        "reopen_pr",
        "merge_pr",
        "add_comment",
        "list_comments",
        "add_labels",
        "remove_labels",
        "assign_user",
        "unassign_user",
      ];

      if (actionsRequiringNumber.includes(action)) {
        if (
          !normalizedNumber ||
          typeof normalizedNumber !== "number" ||
          normalizedNumber <= 0
        ) {
          const errorMsg = `Missing or invalid required field: number (or issue_number/pr_number) for ${action} (must be positive integer)`;
          console.error("[PR_ISSUE_MANAGER]", errorMsg);
          return { error: errorMsg, success: false };
        }
      }

      if (action === "create_issue" || action === "create_pr") {
        if (!title || typeof title !== "string" || title.trim() === "") {
          const errorMsg = `Missing or invalid required field: title for ${action}`;
          console.error("[PR_ISSUE_MANAGER]", errorMsg);
          return { error: errorMsg, success: false };
        }
      }

      if (action === "create_pr") {
        const requiredFields = { base, head };
        for (const [field, value] of Object.entries(requiredFields)) {
          if (!value || typeof value !== "string" || value.trim() === "") {
            const errorMsg = `Missing or invalid required field: ${field} for create_pr`;
            console.error("[PR_ISSUE_MANAGER]", errorMsg);
            return { error: errorMsg, success: false };
          }
        }
      }

      if (action === "add_comment") {
        if (
          !comment_body ||
          typeof comment_body !== "string" ||
          comment_body.trim() === ""
        ) {
          const errorMsg =
            "Missing or invalid required field: comment_body for add_comment";
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
      let method = "GET";
      let queryParams = {};

      // Build endpoint, payload, and method based on action
      switch (action) {
        case "list_issues":
          endpoint = `${api}/repos/${owner}/${reponame}/issues`;
          queryParams = {
            state: state || "open",
            labels: labels
              ? Array.isArray(labels)
                ? labels.join(",")
                : labels
              : undefined,
            assignee: assignees
              ? Array.isArray(assignees)
                ? assignees[0]
                : assignees
              : undefined,
            milestone: milestone || undefined,
            sort: sort || "created",
            direction: direction || "desc",
            per_page: per_page || 30,
            page: page || 1,
            since: since || undefined,
          };
          // Remove undefined values
          Object.keys(queryParams).forEach(
            (key) => queryParams[key] === undefined && delete queryParams[key]
          );
          break;

        case "list_prs":
          endpoint = `${api}/repos/${owner}/${reponame}/pulls`;
          queryParams = {
            state: state || "open",
            head: head || undefined,
            base: base || undefined,
            sort: sort || "created",
            direction: direction || "desc",
            per_page: per_page || 30,
            page: page || 1,
          };
          Object.keys(queryParams).forEach(
            (key) => queryParams[key] === undefined && delete queryParams[key]
          );
          break;

        case "get_issue":
          endpoint = `${api}/repos/${owner}/${reponame}/issues/${normalizedNumber}`;
          break;

        case "get_pr":
          endpoint = `${api}/repos/${owner}/${reponame}/pulls/${normalizedNumber}`;
          break;

        case "create_issue":
          endpoint = `${api}/repos/${owner}/${reponame}/issues`;
          payload = {
            title,
            body: body || "",
            labels: labels || [],
            assignees: assignees || [],
            milestone: milestone || null,
            ...(extra || {}),
          };
          method = "POST";
          break;

        case "update_issue":
          endpoint = `${api}/repos/${owner}/${reponame}/issues/${normalizedNumber}`;
          payload = {
            ...(title && { title }),
            ...(body !== undefined && { body }),
            ...(state && { state }),
            ...(labels && { labels }),
            ...(assignees && { assignees }),
            ...(milestone !== undefined && { milestone }),
            ...(extra || {}),
          };
          method = "PATCH";
          break;

        case "create_pr":
          endpoint = `${api}/repos/${owner}/${reponame}/pulls`;
          payload = {
            title,
            body: body || "",
            base,
            head,
            draft: extra?.draft || false,
            ...(extra || {}),
          };
          method = "POST";
          break;

        case "update_pr":
          endpoint = `${api}/repos/${owner}/${reponame}/pulls/${normalizedNumber}`;
          payload = {
            ...(title && { title }),
            ...(body !== undefined && { body }),
            ...(state && { state }),
            ...(base && { base }),
            ...(extra || {}),
          };
          method = "PATCH";
          break;

        case "close_issue":
        case "close_pr":
          endpoint = `${api}/repos/${owner}/${reponame}/${
            action.includes("issue") ? "issues" : "pulls"
          }/${normalizedNumber}`;
          payload = { state: "closed" };
          method = "PATCH";
          break;

        case "reopen_issue":
        case "reopen_pr":
          endpoint = `${api}/repos/${owner}/${reponame}/${
            action.includes("issue") ? "issues" : "pulls"
          }/${normalizedNumber}`;
          payload = { state: "open" };
          method = "PATCH";
          break;

        case "merge_pr":
          endpoint = `${api}/repos/${owner}/${reponame}/pulls/${normalizedNumber}/merge`;
          payload = {
            commit_title:
              commit_title || `Merge pull request #${normalizedNumber}`,
            commit_message: commit_message || "",
            merge_method: merge_method || "merge",
            sha: sha || undefined,
          };
          method = "PUT";
          break;

        case "add_comment":
          endpoint = `${api}/repos/${owner}/${reponame}/issues/${normalizedNumber}/comments`;
          payload = { body: comment_body };
          method = "POST";
          break;

        case "list_comments":
          endpoint = `${api}/repos/${owner}/${reponame}/issues/${normalizedNumber}/comments`;
          queryParams = {
            sort: sort || "created",
            direction: direction || "asc",
            per_page: per_page || 30,
            page: page || 1,
            since: since || undefined,
          };
          Object.keys(queryParams).forEach(
            (key) => queryParams[key] === undefined && delete queryParams[key]
          );
          break;

        case "add_labels":
          endpoint = `${api}/repos/${owner}/${reponame}/issues/${normalizedNumber}/labels`;
          payload = { labels: Array.isArray(labels) ? labels : [labels] };
          method = "POST";
          break;

        case "remove_labels":
          if (labels && labels.length > 0) {
            // Remove specific labels
            const labelList = Array.isArray(labels) ? labels : [labels];
            endpoint = `${api}/repos/${owner}/${reponame}/issues/${normalizedNumber}/labels/${labelList[0]}`;
            method = "DELETE";
            // Note: GitHub API only allows removing one label at a time via DELETE
          } else {
            // Remove all labels
            endpoint = `${api}/repos/${owner}/${reponame}/issues/${normalizedNumber}/labels`;
            method = "DELETE";
          }
          break;

        case "assign_user":
          endpoint = `${api}/repos/${owner}/${reponame}/issues/${normalizedNumber}/assignees`;
          payload = {
            assignees: Array.isArray(assignees) ? assignees : [assignees],
          };
          method = "POST";
          break;

        case "unassign_user":
          endpoint = `${api}/repos/${owner}/${reponame}/issues/${normalizedNumber}/assignees`;
          payload = {
            assignees: Array.isArray(assignees) ? assignees : [assignees],
          };
          method = "DELETE";
          break;
      }

      // Add query parameters to URL if any
      if (Object.keys(queryParams).length > 0) {
        const urlParams = new URLSearchParams(queryParams);
        endpoint += `?${urlParams.toString()}`;
      }

      console.log(`[PR_ISSUE_MANAGER] Making ${method} request to:`, endpoint);
      if (Object.keys(payload).length > 0) {
        console.log(
          `[PR_ISSUE_MANAGER] Payload:`,
          JSON.stringify(payload, null, 2)
        );
      }

      // Make the API request
      switch (method) {
        case "GET":
          res = await axios.get(endpoint, { headers });
          break;
        case "POST":
          res = await axios.post(endpoint, payload, { headers });
          break;
        case "PATCH":
          res = await axios.patch(endpoint, payload, { headers });
          break;
        case "PUT":
          res = await axios.put(endpoint, payload, { headers });
          break;
        case "DELETE":
          res = await axios.delete(
            endpoint,
            Object.keys(payload).length > 0
              ? { headers, data: payload }
              : { headers }
          );
          break;
      }

      console.log(
        `[PR_ISSUE_MANAGER] Success! ${action} completed for ${owner}/${reponame}`
      );

      // Return structured response based on action type
      let response = {
        success: true,
        action,
        repo: `${owner}/${reponame}`,
        message: `${action.replace(/_/g, " ")} completed successfully`,
      };

      // Add action-specific response data
      if (action.startsWith("list_")) {
        response.data = res.data;
        response.count = res.data.length;
        response.total_count = res.headers["x-total-count"] || res.data.length;
      } else if (action.startsWith("get_")) {
        response.data = res.data;
      } else if (action === "merge_pr") {
        response.merged = true;
        response.sha = res.data.sha;
        response.message = res.data.message;
      } else if (action === "add_comment") {
        response.comment = {
          id: res.data.id,
          html_url: res.data.html_url,
          created_at: res.data.created_at,
          body: res.data.body,
        };
      } else if (action === "list_comments") {
        response.comments = res.data;
        response.count = res.data.length;
      } else if (res.data) {
        // For create/update operations, include key fields
        response.id = res.data.id;
        response.number = res.data.number;
        response.html_url = res.data.html_url;
        response.state = res.data.state;
        response.title = res.data.title;
        response.created_at = res.data.created_at;
        response.updated_at = res.data.updated_at;

        if (action.includes("pr")) {
          response.mergeable = res.data.mergeable;
          response.merged = res.data.merged;
        }
      }

      // For LangChain agents, return a formatted string response
      if (action.startsWith("list_")) {
        const items = res.data;
        if (items.length === 0) {
          return `No ${
            action.includes("issue") ? "issues" : "pull requests"
          } found in ${owner}/${reponame}.`;
        }

        const itemType = action.includes("issue") ? "issues" : "pull requests";
        let summary = `Found ${items.length} ${itemType} in ${owner}/${reponame}:\n\n`;

        items.forEach((item, index) => {
          summary += `${index + 1}. #${item.number}: ${item.title}\n`;
          summary += `   State: ${item.state}\n`;
          summary += `   Created: ${new Date(
            item.created_at
          ).toLocaleDateString()}\n`;
          summary += `   URL: ${item.html_url}\n`;
          if (item.labels && item.labels.length > 0) {
            summary += `   Labels: ${item.labels
              .map((l) => l.name)
              .join(", ")}\n`;
          }
          if (item.assignees && item.assignees.length > 0) {
            summary += `   Assignees: ${item.assignees
              .map((a) => a.login)
              .join(", ")}\n`;
          }
          summary += `\n`;
        });

        return summary;
      } else if (action.startsWith("get_")) {
        const item = res.data;
        const itemType = action.includes("issue") ? "Issue" : "Pull Request";
        let details = `${itemType} #${item.number}: ${item.title}\n\n`;
        details += `State: ${item.state}\n`;
        details += `Created: ${new Date(
          item.created_at
        ).toLocaleDateString()}\n`;
        details += `Updated: ${new Date(
          item.updated_at
        ).toLocaleDateString()}\n`;
        details += `Author: ${item.user.login}\n`;
        details += `URL: ${item.html_url}\n`;

        if (item.labels && item.labels.length > 0) {
          details += `Labels: ${item.labels.map((l) => l.name).join(", ")}\n`;
        }
        if (item.assignees && item.assignees.length > 0) {
          details += `Assignees: ${item.assignees
            .map((a) => a.login)
            .join(", ")}\n`;
        }
        if (item.body) {
          details += `\nDescription:\n${item.body}\n`;
        }

        return details;
      } else {
        // For other actions, return the structured response as JSON string
        return JSON.stringify(response, null, 2);
      }
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
            ". Check if the repository, issue, or PR exists and you have access to it.";
        } else if (status === 401) {
          errorMsg +=
            ". Check if your GitHub token is valid and has the required permissions.";
        } else if (status === 422) {
          errorMsg += ". Check if all required fields are provided and valid.";
        } else if (status === 403) {
          errorMsg += ". Rate limit exceeded or insufficient permissions.";
        } else if (status === 409) {
          errorMsg +=
            ". Conflict - the resource may already be in the requested state.";
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
