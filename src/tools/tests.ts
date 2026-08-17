import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Workspace } from "../workspace/workspace.js";

const execFileAsync = promisify(execFile);

export type TestError = { ok: false; error: { message: string; code?: string } };
export type TestSuccess<T> = { ok: true; data: T };
export type TestResult<T> = TestSuccess<T> | TestError;

async function runNpmCommand(workspace: Workspace, args: string[]): Promise<TestResult<string>> {
  try {
    const { stdout, stderr } = await execFileAsync("npm", args, {
      cwd: workspace.root,
      maxBuffer: 5 * 1024 * 1024,
    });
    return { ok: true, data: (stdout || stderr).trim() };
  } catch (error) {
    const err = error as { message?: string; stderr?: string; code?: string | number };
    return {
      ok: false,
      error: {
        message: err.stderr?.trim() || err.message || "Npm command failed.",
        code: typeof err.code === "string" ? err.code : "NPM_COMMAND_FAILED",
      },
    };
  }
}

export async function runTests(workspace: Workspace): Promise<TestResult<string>> {
  return runNpmCommand(workspace, ["test"]);
}

export async function runBuild(workspace: Workspace): Promise<TestResult<string>> {
  return runNpmCommand(workspace, ["run", "build"]);
}

export async function runLint(workspace: Workspace): Promise<TestResult<string>> {
  return runNpmCommand(workspace, ["run", "lint"]);
}
