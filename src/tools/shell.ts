import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Workspace } from "../workspace/workspace.js";

const execAsync = promisify(exec);

export type ShellError = { ok: false; error: { message: string; code?: string } };
export type ShellSuccess<T> = { ok: true; data: T };
export type ShellResult<T> = ShellSuccess<T> | ShellError;

const FORBIDDEN_SHELL_PATTERNS = [
  /\brm\s+-rf\s+[\/\~]/i,
  /\bmkfs\b/i,
  /\bdd\b\s+if=/i,
  />\s*\/dev\/sd[a-z]/i,
];

export async function executeShellCommand(
  workspace: Workspace,
  command: string
): Promise<ShellResult<string>> {
  if (!command || !command.trim()) {
    return { ok: false, error: { message: "Shell command must not be empty.", code: "INVALID_COMMAND" } };
  }

  for (const pattern of FORBIDDEN_SHELL_PATTERNS) {
    if (pattern.test(command)) {
      return {
        ok: false,
        error: { message: "Potentially destructive shell command rejected.", code: "COMMAND_FORBIDDEN" },
      };
    }
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workspace.root,
      maxBuffer: 5 * 1024 * 1024,
    });
    return { ok: true, data: (stdout || stderr).trim() };
  } catch (error) {
    const err = error as { message?: string; stderr?: string; code?: string | number };
    return {
      ok: false,
      error: {
        message: err.stderr?.trim() || err.message || "Shell command failed.",
        code: typeof err.code === "string" ? err.code : "SHELL_ERROR",
      },
    };
  }
}
