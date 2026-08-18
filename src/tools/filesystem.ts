import fs from "node:fs/promises";
import path from "node:path";
import type { Workspace } from "../workspace/workspace.js";
import { resolveWorkspacePath, displayWorkspacePath } from "../security/permissions.js";

const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".cache",
  "coverage",
]);

const MAX_FILE_SIZE_BYTES = 1_000_000;

export type FilesystemError = { ok: false; error: { message: string; code?: string } };
export type FilesystemSuccess<T> = { ok: true; data: T };
export type FilesystemResult<T> = FilesystemSuccess<T> | FilesystemError;

export type FileEntry = {
  name: string;
  type: "file" | "directory" | "symlink" | "other";
  path: string;
};

function failure(error: unknown, fallback: string): FilesystemError {
  const nodeError = error as NodeJS.ErrnoException;
  const details = { message: nodeError.message || fallback };
  return nodeError.code
    ? { ok: false, error: { ...details, code: nodeError.code } }
    : { ok: false, error: details };
}

export async function listFiles(
  workspace: Workspace,
  directory = "."
): Promise<FilesystemResult<FileEntry[]>> {
  const resolved = await resolveWorkspacePath(workspace, directory);
  if (!resolved.ok) return resolved;

  try {
    const entries = await fs.readdir(resolved.data, { withFileTypes: true });
    return {
      ok: true,
      data: entries
        .map((entry): FileEntry => ({
          name: entry.name,
          type: entry.isDirectory()
            ? "directory"
            : entry.isFile()
            ? "file"
            : entry.isSymbolicLink()
            ? "symlink"
            : "other",
          path: displayWorkspacePath(workspace, path.join(resolved.data, entry.name)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  } catch (error) {
    return failure(error, "Unable to list the directory.");
  }
}

export async function listTree(
  workspace: Workspace,
  directory = ".",
  maxDepth = 3
): Promise<FilesystemResult<string>> {
  const resolved = await resolveWorkspacePath(workspace, directory);
  if (!resolved.ok) return resolved;

  try {
    const rootStats = await fs.stat(resolved.data);
    if (!rootStats.isDirectory()) {
      return { ok: false, error: { message: "The requested path is not a directory.", code: "NOT_A_DIRECTORY" } };
    }

    const lines: string[] = [path.basename(resolved.data) || workspace.name];
    let rootLabel = path.basename(resolved.data) || workspace.name;
    if (resolved.data === workspace.root) {
      rootLabel = workspace.name;
      lines[0] = `${workspace.name}/`;
    }

    const walk = async (currentPath: string, depth: number, prefix = ""): Promise<void> => {
      if (depth > maxDepth) return;
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      const visibleEntries = entries
        .filter((entry) => !SKIPPED_DIRECTORIES.has(entry.name) && !entry.name.startsWith("."))
        .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

      for (let index = 0; index < visibleEntries.length; index += 1) {
        const entry = visibleEntries[index];
        if (!entry) continue;
        const isLast = index === visibleEntries.length - 1;
        const connector = isLast ? "└── " : "├── ";
        const label = entry.isDirectory() ? `${entry.name}/` : entry.name;
        lines.push(`${prefix}${connector}${label}`);

        if (entry.isDirectory() && depth < maxDepth) {
          const nextPrefix = `${prefix}${isLast ? "    " : "│   "}`;
          await walk(path.join(currentPath, entry.name), depth + 1, nextPrefix);
        }
      }
    };

    await walk(resolved.data, 0, "");
    if (lines.length === 1) {
      const relativePath = path.relative(workspace.root, resolved.data);
      return { ok: true, data: relativePath ? `${relativePath}/` : `${rootLabel}/` };
    }
    return { ok: true, data: `${rootLabel}/\n${lines.slice(1).join("\n")}` };
  } catch (error) {
    return failure(error, "Unable to list the project tree.");
  }
}

export async function readFile(
  workspace: Workspace,
  filePath: string
): Promise<FilesystemResult<{ path: string; content: string; size: number; encoding: "utf-8" }>> {
  const resolved = await resolveWorkspacePath(workspace, filePath);
  if (!resolved.ok) return resolved;

  try {
    const stats = await fs.stat(resolved.data);
    if (!stats.isFile()) {
      return { ok: false, error: { message: "The requested path is not a file.", code: "NOT_A_FILE" } };
    }
    if (stats.size > MAX_FILE_SIZE_BYTES) {
      return {
        ok: false,
        error: {
          message: `Refusing to read files larger than ${MAX_FILE_SIZE_BYTES} bytes.`,
          code: "FILE_TOO_LARGE",
        },
      };
    }
    return {
      ok: true,
      data: {
        path: displayWorkspacePath(workspace, resolved.data),
        content: await fs.readFile(resolved.data, "utf8"),
        size: stats.size,
        encoding: "utf-8",
      },
    };
  } catch (error) {
    return failure(error, "Unable to read the file.");
  }
}

export async function searchFiles(
  workspace: Workspace,
  directory: string,
  query: string
): Promise<FilesystemResult<Array<{ path: string; matches: Array<{ line: number; text: string }> }>>> {
  if (!query.trim()) {
    return { ok: false, error: { message: "Search query must not be empty.", code: "INVALID_QUERY" } };
  }
  const resolved = await resolveWorkspacePath(workspace, directory);
  if (!resolved.ok) return resolved;

  const results: Array<{ path: string; matches: Array<{ line: number; text: string }> }> = [];
  const explicitlyRequestedSkippedDirectory = SKIPPED_DIRECTORIES.has(path.basename(resolved.data));

  async function visit(currentPath: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name) && !explicitlyRequestedSkippedDirectory) continue;
        await visit(entryPath);
      } else if (entry.isFile()) {
        try {
          const stats = await fs.stat(entryPath);
          if (stats.size > MAX_FILE_SIZE_BYTES) continue;
          const lines = (await fs.readFile(entryPath, "utf8")).split(/\r?\n/);
          const matches = lines.flatMap((text, index) =>
            text.includes(query) ? [{ line: index + 1, text }] : []
          );
          if (matches.length) {
            results.push({ path: displayWorkspacePath(workspace, entryPath), matches });
          }
        } catch {
          /* Skip unreadable or non-text files. */
        }
      }
    }
  }

  try {
    const stats = await fs.stat(resolved.data);
    if (!stats.isDirectory()) {
      return { ok: false, error: { message: "Search directory must be a directory.", code: "NOT_A_DIRECTORY" } };
    }
    await visit(resolved.data);
    return { ok: true, data: results };
  } catch (error) {
    return failure(error, "Unable to search the directory.");
  }
}

export async function writeFile(
  workspace: Workspace,
  filePath: string,
  content: string
): Promise<FilesystemResult<{ path: string; size: number }>> {
  const resolved = await resolveWorkspacePath(workspace, filePath);
  if (!resolved.ok) return resolved;

  try {
    const dir = path.dirname(resolved.data);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(resolved.data, content, "utf8");
    const stats = await fs.stat(resolved.data);
    return {
      ok: true,
      data: {
        path: displayWorkspacePath(workspace, resolved.data),
        size: stats.size,
      },
    };
  } catch (error) {
    return failure(error, "Unable to write to file.");
  }
}

