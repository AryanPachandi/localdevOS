import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Workspace {
  root: string;
  name: string;
}

export function createWorkspace(root?: string): Workspace {
  let targetPath = root && root.trim() ? root.trim() : process.cwd();

  if (targetPath.startsWith("~")) {
    targetPath = path.join(os.homedir(), targetPath.slice(1));
  }

  const absolutePath = path.resolve(targetPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Workspace directory does not exist: ${absolutePath}`);
  }

  const stats = fs.statSync(absolutePath);
  if (!stats.isDirectory()) {
    throw new Error(`Workspace path is not a directory: ${absolutePath}`);
  }

  const name = path.basename(absolutePath) || absolutePath;

  return {
    root: absolutePath,
    name,
  };
}
