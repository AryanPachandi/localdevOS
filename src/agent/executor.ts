import { listFiles, readFile, writeFile, searchFiles } from "../tools/filesystem.js";
import { gitStatus, gitDiff, gitLog, gitInit, gitAdd, gitCommit, gitPush, gitRemote } from "../tools/git.js";
import { checkGitHubAuth, createGitHubRepository, deployToGitHub, pushExistingRepository } from "../tools/github.js";
import { dockerPs, dockerComposeUp, dockerComposeBuild } from "../tools/docker.js";
import { executeShellCommand } from "../tools/shell.js";
import { runTests, runBuild, runLint } from "../tools/tests.js";
import type { Workspace } from "../workspace/workspace.js";
import "dotenv/config";

type ToolError = { ok: false; error: { message: string; code: string } };

export type ApprovalHandler = (request: { command: string; reason: string }) => Promise<boolean>;

function stringArgument(args: Record<string, unknown>, name: string): string | ToolError {
  const value = args[name];
  return typeof value === "string" && value.trim()
    ? value
    : { ok: false, error: { message: `Tool argument '${name}' must be a non-empty string.`, code: "INVALID_ARGUMENTS" } };
}

export async function executeTool(
  name: string,
  args: Record<string, unknown> = {},
  workspace: Workspace,
  onApprovalRequest?: ApprovalHandler
): Promise<unknown> {
  switch (name) {
    case "list_files": {
      const directory = args.directory ? stringArgument(args, "directory") : ".";
      if (typeof directory !== "string") return directory;
      return listFiles(workspace, directory);
    }
    case "read_file": {
      const filePath = stringArgument(args, "filePath");
      return typeof filePath === "string" ? readFile(workspace, filePath) : filePath;
    }
    case "write_file": {
      const filePath = stringArgument(args, "filePath");
      const content = typeof args.content === "string" ? args.content : "";
      if (typeof filePath !== "string") return filePath;
      return writeFile(workspace, filePath, content);
    }
    case "search_files": {
      const directory = args.directory ? stringArgument(args, "directory") : ".";
      const query = stringArgument(args, "query");
      if (typeof directory !== "string") return directory;
      if (typeof query !== "string") return query;
      return searchFiles(workspace, directory, query);
    }
    case "deploy_to_github": {
      const repoName = typeof args.repoName === "string" ? args.repoName : workspace.name;
      const isPrivate = typeof args.isPrivate === "boolean" ? args.isPrivate : true;

      if (onApprovalRequest) {
        const approved = await onApprovalRequest({
          command: `gh repo create ${repoName} ${isPrivate ? "--private" : "--public"} --source=. --remote=origin && git push`,
          reason: `Create GitHub repository '${repoName}' (${isPrivate ? "Private" : "Public"}) and push code from workspace [${workspace.root}].`,
        });
        if (!approved) {
          return { ok: false, error: { message: "Deployment cancelled by user approval.", code: "ACTION_DENIED" } };
        }
      }

      return deployToGitHub(workspace, { repoName, isPrivate });
    }
    case "push_existing_repository": {
      const commitMessage = typeof args.commitMessage === "string" ? args.commitMessage : undefined;

      if (onApprovalRequest) {
        const approved = await onApprovalRequest({
          command: `git commit -m "${commitMessage || "Update project"}" && git push origin`,
          reason: `Commit and push changes to GitHub remote origin for workspace [${workspace.root}].`,
        });
        if (!approved) {
          return { ok: false, error: { message: "Push cancelled by user approval.", code: "ACTION_DENIED" } };
        }
      }

      return pushExistingRepository(workspace, commitMessage ? { commitMessage } : {});
    }
    case "github_auth_status": {
      return checkGitHubAuth();
    }
    case "github_create_repository": {
      const repoName = stringArgument(args, "repoName");
      if (typeof repoName !== "string") return repoName;
      const isPrivate = typeof args.isPrivate === "boolean" ? args.isPrivate : true;

      if (onApprovalRequest) {
        const approved = await onApprovalRequest({
          command: `gh repo create ${repoName} ${isPrivate ? "--private" : "--public"} --source=. --remote=origin`,
          reason: `Create a GitHub repository named '${repoName}'.`,
        });
        if (!approved) {
          return { ok: false, error: { message: "Repository creation cancelled by user approval.", code: "ACTION_DENIED" } };
        }
      }

      return createGitHubRepository(workspace, repoName, isPrivate);
    }
    case "git_status": {
      return gitStatus(workspace);
    }
    case "git_diff": {
      return gitDiff(workspace);
    }
    case "git_log": {
      const maxCount = typeof args.maxCount === "number" ? args.maxCount : 5;
      return gitLog(workspace, maxCount);
    }
    case "git_init": {
      return gitInit(workspace);
    }
    case "git_add": {
      const pathSpec = typeof args.pathSpec === "string" ? args.pathSpec : ".";
      return gitAdd(workspace, pathSpec);
    }
    case "git_commit": {
      const message = stringArgument(args, "message");
      if (typeof message !== "string") return message;
      return gitCommit(workspace, message);
    }
    case "git_push": {
      const remote = typeof args.remote === "string" ? args.remote : "origin";
      const branch = typeof args.branch === "string" ? args.branch : undefined;

      if (onApprovalRequest) {
        const approved = await onApprovalRequest({
          command: `git push ${remote} ${branch || ""}`,
          reason: `Push commits to remote '${remote}'.`,
        });
        if (!approved) {
          return { ok: false, error: { message: "Git push cancelled by user approval.", code: "ACTION_DENIED" } };
        }
      }

      return gitPush(workspace, remote, branch);
    }
    case "git_remote": {
      return gitRemote(workspace);
    }
    case "docker_ps": {
      return dockerPs();
    }
    case "docker_compose_up": {
      return dockerComposeUp(workspace);
    }
    case "docker_compose_build": {
      return dockerComposeBuild(workspace);
    }
    case "execute_shell": {
      const command = stringArgument(args, "command");
      if (typeof command !== "string") return command;

      if (onApprovalRequest) {
        const approved = await onApprovalRequest({
          command,
          reason: `Execute shell command inside workspace [${workspace.root}].`,
        });
        if (!approved) {
          return { ok: false, error: { message: "Shell execution cancelled by user approval.", code: "ACTION_DENIED" } };
        }
      }

      return executeShellCommand(workspace, command);
    }
    case "run_tests": {
      return runTests(workspace);
    }
    case "run_build": {
      return runBuild(workspace);
    }
    case "run_lint": {
      return runLint(workspace);
    }
    default:
      return { ok: false, error: { message: `Unknown tool: ${name}`, code: "UNKNOWN_TOOL" } };
  }
}
