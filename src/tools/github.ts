import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Workspace } from "../workspace/workspace.js";
import {
  gitIsInitialized,
  gitInit,
  gitStatusPorcelain,
  gitAdd,
  gitCommit,
  gitPush,
  gitRemote,
  gitCurrentBranch,
  gitDiff,
  detectUnstagedSecrets,
} from "./git.js";

const execFileAsync = promisify(execFile);

export type GitHubResult<T> = { ok: true; data: T } | { ok: false; error: { message: string; code?: string } };

export async function checkGitHubAuth(): Promise<GitHubResult<string>> {
  try {
    const { stdout, stderr } = await execFileAsync("gh", ["auth", "status"]);
    return { ok: true, data: (stdout || stderr).trim() };
  } catch (error) {
    const err = error as { message?: string; stderr?: string };
    return {
      ok: false,
      error: {
        message: err.stderr?.trim() || err.message || "GitHub CLI authentication required.",
        code: "GH_AUTH_REQUIRED",
      },
    };
  }
}

export async function createGitHubRepository(
  workspace: Workspace,
  repoName: string,
  isPrivate = true
): Promise<GitHubResult<string>> {
  const args = ["repo", "create", repoName, isPrivate ? "--private" : "--public", "--source=.", "--remote=origin"];

  try {
    const { stdout, stderr } = await execFileAsync("gh", args, {
      cwd: workspace.root,
      maxBuffer: 5 * 1024 * 1024,
    });
    return { ok: true, data: (stdout || stderr).trim() };
  } catch (error) {
    const err = error as { message?: string; stderr?: string };
    return {
      ok: false,
      error: {
        message: err.stderr?.trim() || err.message || "Failed to create GitHub repository.",
        code: "GH_CREATE_REPO_FAILED",
      },
    };
  }
}

export async function deployToGitHub(
  workspace: Workspace,
  options: { repoName?: string; isPrivate?: boolean; commitMessage?: string } = {}
): Promise<GitHubResult<{ url: string; branch: string; commit: string; message: string }>> {
  if (!workspace || !workspace.root) {
    return {
      ok: false,
      error: { message: "No workspace is currently selected.", code: "NO_WORKSPACE" },
    };
  }

  // 1. Check Git initialization
  const initialized = await gitIsInitialized(workspace);
  if (!initialized) {
    console.log("⚙️ Initializing Git in workspace:", workspace.root);
    const initRes = await gitInit(workspace);
    if (!initRes.ok) {
      return { ok: false, error: { message: `Failed to initialize Git: ${initRes.error.message}` } };
    }
  }

  // 2. Check GitHub CLI Authentication
  const authRes = await checkGitHubAuth();
  if (!authRes.ok) {
    return {
      ok: false,
      error: {
        message: "GitHub authentication is required.\n\nPlease run:\n\n  gh auth login\n\nin your terminal to authenticate with GitHub.",
        code: "GH_AUTH_REQUIRED",
      },
    };
  }

  // 3. Determine repository name
  const repoName = options.repoName || workspace.name || "my-project";
  const isPrivate = options.isPrivate !== false; // Default to private unless explicitly false

  // 4. Secret detection
  const secretScan = await detectUnstagedSecrets(workspace);
  if (secretScan.hasSecrets && secretScan.warningMessage) {
    console.warn(secretScan.warningMessage);
  }

  // 5. Create GitHub repository
  console.log(`📦 Creating GitHub repository '${repoName}' (${isPrivate ? "Private" : "Public"})...`);
  const createRes = await createGitHubRepository(workspace, repoName, isPrivate);

  // If repo creation failed because it already exists, try continuing or setting origin
  if (!createRes.ok && !createRes.error.message.includes("already exists")) {
    return { ok: false, error: { message: createRes.error.message, code: "GH_REPO_CREATE_FAILED" } };
  }

  // 6. Stage files
  const stageRes = await gitAdd(workspace, ".");
  if (!stageRes.ok) {
    return { ok: false, error: { message: `Failed to stage files: ${stageRes.error.message}` } };
  }

  // 7. Commit
  const commitMsg = options.commitMessage || "Initial commit";
  const commitRes = await gitCommit(workspace, commitMsg);
  // Allow commit error if nothing to commit

  // 8. Branch & Push
  const branch = await gitCurrentBranch(workspace);
  const pushRes = await gitPush(workspace, "origin", branch);

  if (!pushRes.ok && !pushRes.error.message.includes("Everything up-to-date")) {
    return { ok: false, error: { message: `Failed to push to GitHub: ${pushRes.error.message}` } };
  }

  // 9. Formulate Repo URL
  // Resolve user username or remote url
  const remoteRes = await gitRemote(workspace);
  let repoUrl = `https://github.com/${repoName}`;
  if (remoteRes.ok && remoteRes.data) {
    const rawUrl = remoteRes.data.trim();
    if (rawUrl.startsWith("https://github.com/")) {
      repoUrl = rawUrl.replace(/\.git$/, "");
    } else if (rawUrl.startsWith("git@github.com:")) {
      repoUrl = `https://github.com/${rawUrl.slice(15).replace(/\.git$/, "")}`;
    }
  }

  const resultMsg = `🚀 Project deployed successfully.

Repository:
[${repoUrl}](${repoUrl})

Branch:
${branch}

Commit:
${commitMsg}`;

  return {
    ok: true,
    data: {
      url: repoUrl,
      branch,
      commit: commitMsg,
      message: resultMsg,
    },
  };
}

export async function pushExistingRepository(
  workspace: Workspace,
  options: { commitMessage?: string } = {}
): Promise<GitHubResult<{ branch: string; commit: string; message: string }>> {
  if (!workspace || !workspace.root) {
    return {
      ok: false,
      error: { message: "No workspace is currently selected.", code: "NO_WORKSPACE" },
    };
  }

  // 1. Check if origin remote exists
  const remoteRes = await gitRemote(workspace);
  if (!remoteRes.ok || !remoteRes.data) {
    return {
      ok: false,
      error: {
        message: "⚠️ This project does not have a GitHub remote configured.\n\nWould you like me to deploy it to GitHub and create a repository?",
        code: "NO_REMOTE_CONFIGURED",
      },
    };
  }

  // 2. Check Git status for changes
  const statusRes = await gitStatusPorcelain(workspace);
  if (!statusRes.ok) {
    return { ok: false, error: { message: `Failed to check Git status: ${statusRes.error.message}` } };
  }

  if (!statusRes.data || !statusRes.data.trim()) {
    return {
      ok: true,
      data: {
        branch: await gitCurrentBranch(workspace),
        commit: "None",
        message: "✓ Working tree is clean. There are no changes to commit or push.",
      },
    };
  }

  // 3. Secret detection
  const secretScan = await detectUnstagedSecrets(workspace);
  if (secretScan.hasSecrets && secretScan.warningMessage) {
    console.warn(secretScan.warningMessage);
  }

  // 4. Generate commit message if not provided
  let commitMsg = options.commitMessage;
  if (!commitMsg) {
    const diffRes = await gitDiff(workspace);
    if (diffRes.ok && diffRes.data) {
      const diffLines = diffRes.data.split("\n");
      const modifiedFiles = diffLines.filter((l) => l.startsWith("--- a/")).map((l) => l.slice(6));
      commitMsg = modifiedFiles.length > 0 ? `Update ${modifiedFiles.slice(0, 3).join(", ")}` : "Update project";
    } else {
      commitMsg = "Update project";
    }
  }

  // 5. Stage, Commit, Push
  await gitAdd(workspace, ".");
  await gitCommit(workspace, commitMsg);
  const branch = await gitCurrentBranch(workspace);
  const pushRes = await gitPush(workspace, "origin", branch);

  if (!pushRes.ok && !pushRes.error.message.includes("Everything up-to-date")) {
    return { ok: false, error: { message: `Failed to push: ${pushRes.error.message}` } };
  }

  return {
    ok: true,
    data: {
      branch,
      commit: commitMsg,
      message: `✓ Successfully pushed changes to GitHub.\n\nBranch: ${branch}\nCommit: ${commitMsg}`,
    },
  };
}
