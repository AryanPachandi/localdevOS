import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Workspace } from "../workspace/workspace.js";

const execFileAsync = promisify(execFile);

export type DockerError = { ok: false; error: { message: string; code?: string } };
export type DockerSuccess<T> = { ok: true; data: T };
export type DockerResult<T> = DockerSuccess<T> | DockerError;

async function runDockerCommand(
  args: string[],
  cwd?: string
): Promise<DockerResult<string>> {
  try {
    const { stdout, stderr } = await execFileAsync("docker", args, {
      cwd,
      maxBuffer: 5 * 1024 * 1024,
    });
    return { ok: true, data: (stdout || stderr).trim() };
  } catch (error) {
    const err = error as { message?: string; stderr?: string; code?: string | number };
    return {
      ok: false,
      error: {
        message: err.stderr?.trim() || err.message || "Docker command failed.",
        code: typeof err.code === "string" ? err.code : "DOCKER_ERROR",
      },
    };
  }
}

export async function dockerPs(): Promise<DockerResult<string>> {
  return runDockerCommand(["ps"]);
}

export async function dockerComposeUp(workspace: Workspace): Promise<DockerResult<string>> {
  return runDockerCommand(["compose", "up", "-d"], workspace.root);
}

export async function dockerComposeBuild(workspace: Workspace): Promise<DockerResult<string>> {
  return runDockerCommand(["compose", "build"], workspace.root);
}
