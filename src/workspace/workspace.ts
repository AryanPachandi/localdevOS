import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface GitRepoStatus {
  isRepo: boolean;
  hasRemote: boolean;
  remoteUrl?: string | undefined;
  branch?: string | undefined;
}

export type ProjectType = "react" | "nextjs" | "nodejs" | "docker" | "unknown";
export type PackageManager = "npm" | "yarn" | "pnpm" | "bun" | null;

export interface WorkspaceContext {
  gitStatus: GitRepoStatus;
  projectType: ProjectType;
  packageManager: PackageManager;
  availableScripts: Record<string, string>;
  hasDocker: boolean;
}

export interface Workspace {
  root: string;
  name: string;
  context?: WorkspaceContext;
}

export function detectWorkspaceContext(workspace: Workspace): WorkspaceContext {
  const root = workspace.root;

  // 1. Detect Package Manager & Available Scripts
  let packageManager: PackageManager = null;
  let availableScripts: Record<string, string> = {};
  let projectType: ProjectType = "unknown";

  const pkgPath = path.join(root, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      availableScripts = pkg.scripts || {};
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      if (deps.next) {
        projectType = "nextjs";
      } else if (deps.react || deps["react-dom"]) {
        projectType = "react";
      } else {
        projectType = "nodejs";
      }
    } catch {
      projectType = "nodejs";
    }

    if (fs.existsSync(path.join(root, "bun.lockb")) || fs.existsSync(path.join(root, "bun.lock"))) {
      packageManager = "bun";
    } else if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) {
      packageManager = "pnpm";
    } else if (fs.existsSync(path.join(root, "yarn.lock"))) {
      packageManager = "yarn";
    } else if (fs.existsSync(path.join(root, "package-lock.json"))) {
      packageManager = "npm";
    } else {
      packageManager = "npm";
    }
  }

  // 2. Detect Docker
  const hasDocker =
    fs.existsSync(path.join(root, "Dockerfile")) ||
    fs.existsSync(path.join(root, "docker-compose.yml")) ||
    fs.existsSync(path.join(root, "compose.yaml"));

  if (projectType === "unknown" && hasDocker) {
    projectType = "docker";
  }

  // 3. Detect Git Status
  const gitDir = path.join(root, ".git");
  const isRepo = fs.existsSync(gitDir);
  let hasRemote = false;
  let remoteUrl: string | undefined = undefined;
  let branch: string | undefined = undefined;

  if (isRepo) {
    const configPath = path.join(gitDir, "config");
    if (fs.existsSync(configPath)) {
      const config = fs.readFileSync(configPath, "utf8");
      const match = config.match(/url\s*=\s*(.+)/);
      if (match && match[1]) {
        hasRemote = true;
        remoteUrl = match[1].trim();
      }
    }

    const headPath = path.join(gitDir, "HEAD");
    if (fs.existsSync(headPath)) {
      const head = fs.readFileSync(headPath, "utf8").trim();
      if (head.startsWith("ref: refs/heads/")) {
        branch = head.replace("ref: refs/heads/", "");
      }
    }
  }

  return {
    gitStatus: {
      isRepo,
      hasRemote,
      remoteUrl,
      branch,
    },
    projectType,
    packageManager,
    availableScripts,
    hasDocker,
  };
}

export function createWorkspace(root?: string, userRoot = os.homedir()): Workspace {
  if (!root?.trim()) throw new Error("No active workspace is selected.");
  let targetPath = root.trim();

  if (targetPath.startsWith("~")) {
    targetPath = path.join(os.homedir(), targetPath.slice(1));
  }

  const absolutePath = path.resolve(targetPath);
  const allowedRoot = fs.realpathSync(path.resolve(userRoot));
  const relative = path.relative(allowedRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Workspace must remain inside the user root: ${allowedRoot}`);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Workspace directory does not exist: ${absolutePath}`);
  }

  const stats = fs.statSync(absolutePath);
  if (!stats.isDirectory()) {
    throw new Error(`Workspace path is not a directory: ${absolutePath}`);
  }

  const name = path.basename(absolutePath) || absolutePath;

  const ws: Workspace = {
    root: absolutePath,
    name,
  };

  ws.context = detectWorkspaceContext(ws);
  return ws;
}
