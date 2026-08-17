import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import type { Workspace } from "../workspace/workspace.js";

const execFileAsync = promisify(execFile);

export type GitError = { ok: false; error: { message: string; code?: string } };
export type GitSuccess<T> = { ok: true; data: T };
export type GitResult<T> = GitSuccess<T> | GitError;

async function runGitCommand(workspace: Workspace, args: string[]): Promise<GitResult<string>> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: workspace.root,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { ok: true, data: (stdout || stderr).trim() };
  } catch (error) {
    const err = error as { message?: string; stderr?: string; code?: string | number };
    return {
      ok: false,
      error: {
        message: err.stderr?.trim() || err.message || "Git command failed.",
        code: typeof err.code === "string" ? err.code : "GIT_ERROR",
      },
    };
  }
}

export async function gitIsInitialized(workspace: Workspace): Promise<boolean> {
  const gitDir = path.join(workspace.root, ".git");
  return fs.existsSync(gitDir);
}

export async function gitInit(workspace: Workspace): Promise<GitResult<string>> {
  return runGitCommand(workspace, ["init"]);
}

export async function gitStatus(workspace: Workspace): Promise<GitResult<string>> {
  return runGitCommand(workspace, ["status"]);
}

export async function gitStatusPorcelain(workspace: Workspace): Promise<GitResult<string>> {
  return runGitCommand(workspace, ["status", "--porcelain"]);
}

export async function gitDiff(workspace: Workspace): Promise<GitResult<string>> {
  return runGitCommand(workspace, ["diff"]);
}

export async function gitLog(workspace: Workspace, maxCount = 5): Promise<GitResult<string>> {
  return runGitCommand(workspace, ["log", `-n${maxCount}`]);
}

export async function gitAdd(workspace: Workspace, pathSpec = "."): Promise<GitResult<string>> {
  return runGitCommand(workspace, ["add", pathSpec]);
}

export async function gitCommit(workspace: Workspace, message: string): Promise<GitResult<string>> {
  const cleanMessage = message && message.trim() ? message.trim() : "Update project";
  return runGitCommand(workspace, ["commit", "-m", cleanMessage]);
}

export async function gitRemote(workspace: Workspace): Promise<GitResult<string>> {
  return runGitCommand(workspace, ["remote", "get-url", "origin"]);
}

export async function gitCurrentBranch(workspace: Workspace): Promise<string> {
  const res = await runGitCommand(workspace, ["branch", "--show-current"]);
  if (res.ok && res.data.trim()) {
    return res.data.trim();
  }
  const revRes = await runGitCommand(workspace, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (revRes.ok && revRes.data.trim() && revRes.data.trim() !== "HEAD") {
    return revRes.data.trim();
  }
  return "main";
}

export async function gitPush(workspace: Workspace, remote = "origin", branch?: string): Promise<GitResult<string>> {
  const targetBranch = branch || (await gitCurrentBranch(workspace));
  return runGitCommand(workspace, ["push", "-u", remote, targetBranch]);
}

const SECRET_PATTERNS = [
  /\.env($|\..*)/i,
  /.*\.pem$/i,
  /.*\.key$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /credentials\.json$/i,
  /service-account.*\.json$/i,
];

export async function detectUnstagedSecrets(workspace: Workspace): Promise<{ hasSecrets: boolean; secretFiles: string[]; warningMessage?: string }> {
  const porcelain = await gitStatusPorcelain(workspace);
  if (!porcelain.ok) {
    return { hasSecrets: false, secretFiles: [] };
  }

  const lines = porcelain.data.split("\n").map((l) => l.trim()).filter(Boolean);
  const secretFiles: string[] = [];

  for (const line of lines) {
    const filename = line.slice(3).trim();
    if (SECRET_PATTERNS.some((pattern) => pattern.test(filename))) {
      secretFiles.push(filename);
    }
  }

  if (secretFiles.length > 0) {
    const gitignorePath = path.join(workspace.root, ".gitignore");
    let gitignoreContent = "";
    if (fs.existsSync(gitignorePath)) {
      gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
    }

    const unignoredSecrets = secretFiles.filter((file) => !gitignoreContent.includes(file));

    return {
      hasSecrets: true,
      secretFiles: unignoredSecrets,
      warningMessage: `⚠️ Potential secret file(s) detected:\n${unignoredSecrets.map((f) => `- ${f}`).join("\n")}\nThese will NOT be included in the commit automatically. Ensure sensitive credentials are added to .gitignore.`,
    };
  }

  return { hasSecrets: false, secretFiles: [] };
}
