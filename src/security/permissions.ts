import fs from "node:fs/promises";
import path from "node:path";
import type { Workspace } from "../workspace/workspace.js";

export type PermissionError = { ok: false; error: { message: string; code: string } };
export type PermissionSuccess<T> = { ok: true; data: T };
export type PermissionResult<T> = PermissionSuccess<T> | PermissionError;

/**
 * Validates and resolves an input path relative to the given workspace.
 * Ensures the target path does not escape the workspace root via relative paths
 * or symbolic links.
 */
export async function resolveWorkspacePath(
  workspace: Workspace,
  inputPath: string
): Promise<PermissionResult<string>> {
  const absolutePath = path.resolve(workspace.root, inputPath);
  const relativePath = path.relative(workspace.root, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return {
      ok: false,
      error: {
        message: "Path must stay within the workspace directory.",
        code: "PATH_OUTSIDE_WORKSPACE",
      },
    };
  }

  try {
    const lstats = await fs.lstat(absolutePath);
    if (lstats.isSymbolicLink()) {
      const realWorkspaceRoot = await fs.realpath(workspace.root);
      const realAbsolutePath = await fs.realpath(absolutePath);
      const realRelative = path.relative(realWorkspaceRoot, realAbsolutePath);
      if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
        return {
          ok: false,
          error: {
            message: "Symbolic link targets outside the workspace are forbidden.",
            code: "SYMLINK_OUTSIDE_WORKSPACE",
          },
        };
      }
    }
    return { ok: true, data: absolutePath };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    return {
      ok: false,
      error: {
        message: nodeError.message || "The requested path could not be accessed.",
        code: nodeError.code || "PATH_ACCESS_ERROR",
      },
    };
  }
}

/**
 * Formats an absolute path as a clean, workspace-relative path for LLM display.
 */
export function displayWorkspacePath(workspace: Workspace, absolutePath: string): string {
  const relativePath = path.relative(workspace.root, absolutePath);
  return relativePath ? `./${relativePath.split(path.sep).join("/")}` : ".";
}
