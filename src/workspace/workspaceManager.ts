import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWorkspace, type Workspace } from "./workspace.js";

export type WorkspaceSource = "manual" | "automatic" | "created" | "default";
export interface FileSystemScope { userRoot: string; applicationRoot: string; activeWorkspace: string | null; workspaceName: string | null; source: WorkspaceSource; }
export interface WorkspaceResolution { kind: "resolved" | "ambiguous" | "none"; workspace?: Workspace; candidates?: string[]; source?: WorkspaceSource; message?: string; }
export interface ProjectCreationIntent { action: "create_project"; location: string; projectName: string; framework?: string; deployToGithub?: boolean; }

const KNOWN_LOCATIONS: Record<string, string> = { documents: "Documents", documets: "Documents", downloads: "Downloads", desktop: "Desktop", projects: "Projects", home: "" };
const PROJECT_NAME = /^[A-Za-z0-9_.-]+$/;

/** Maps a recognized location token to a controlled directory; it never accepts arbitrary model paths. */
export function resolveKnownLocation(location: string, userRoot = os.homedir()): string {
  const key = location.trim().toLowerCase();
  if (!(key in KNOWN_LOCATIONS)) throw new Error(`Unsupported project location: ${location}`);
  // Preserve lowercase `projects` as an intentional distinct conventional folder.
  const leaf = key === "projects" && location.trim() === "projects" ? "projects" : KNOWN_LOCATIONS[key]!;
  return path.join(path.resolve(userRoot), leaf);
}

/** Deterministic intent extraction for project creation. The result contains names, never paths. */
export function parseProjectCreationIntent(prompt: string): ProjectCreationIntent | undefined {
  if (!/\b(create|make|generate|scaffold)\b/i.test(prompt)) return undefined;
  const locationMatches = [...prompt.matchAll(/\b(documents|documets|downloads|desktop|projects|home)\b/gi)];
  const location = locationMatches.at(-1)?.[1];
  if (!location) return undefined;
  const named = prompt.match(/\b(?:named|called)\s+(?:by\s+)?([^\s,]+)/i)?.[1]
    ?? prompt.match(/^\s*(?:create|make|generate)\s+(?:a\s+)?(?:next(?:\.js)?\s+)?(?:project\s+)?([^\s,]+)\s+(?:in|inside)\b/i)?.[1];
  if (!named) return undefined;
  if (!PROJECT_NAME.test(named) || named === "." || named === "..") throw new Error(`Invalid project name: ${named}`);
  return { action: "create_project", location, projectName: named, ...( /next\.?js|nextjs/i.test(prompt) ? { framework: "nextjs" } : {}), ...( /github|deploy|push/i.test(prompt) ? { deployToGithub: true } : {}) };
}

export function assertWithinUserRoot(targetPath: string, userRoot = os.homedir()): string {
  const root = fs.realpathSync.native(path.resolve(userRoot));
  const candidate = path.resolve(targetPath.replace(/^~(?=$|[\\/])/, root));
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Path is outside the allowed user root: ${candidate}`);
  // Existing links must resolve within the user root. For new paths, verify the nearest existing parent.
  let existing = candidate;
  while (!fs.existsSync(existing) && existing !== root) existing = path.dirname(existing);
  const realExisting = fs.realpathSync.native(existing);
  const realRelative = path.relative(root, realExisting);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) throw new Error("Symlink target is outside the allowed user root.");
  return candidate;
}

export class WorkspaceManager {
  private active: Workspace | null = null;
  private source: WorkspaceSource = "default";
  private readonly listeners = new Set<(scope: FileSystemScope) => void>();
  readonly userRoot: string;
  readonly applicationRoot: string;
  constructor(options: { userRoot?: string; applicationRoot?: string } = {}) {
    this.userRoot = fs.realpathSync.native(path.resolve(options.userRoot ?? os.homedir()));
    this.applicationRoot = path.resolve(options.applicationRoot ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), "../.."));
    assertWithinUserRoot(this.applicationRoot, this.userRoot);
  }
  getScope(): FileSystemScope { return { userRoot: this.userRoot, applicationRoot: this.applicationRoot, activeWorkspace: this.active?.root ?? null, workspaceName: this.active?.name ?? null, source: this.source }; }
  getActiveWorkspace(): Workspace | null { return this.active; }
  onChange(listener: (scope: FileSystemScope) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  clearActiveWorkspace(): void { this.active = null; this.source = "default"; this.emit(); }
  setActiveWorkspace(target: string, source: WorkspaceSource = "manual"): Workspace {
    const safe = assertWithinUserRoot(target, this.userRoot);
    const workspace = createWorkspace(safe, this.userRoot);
    this.active = workspace; this.source = source; this.emit(); return workspace;
  }
  resolve(prompt: string): WorkspaceResolution {
    const explicit = this.extractExplicitPath(prompt);
    if (explicit) return this.resolvePath(explicit, "automatic");
    let creation: ProjectCreationIntent | undefined;
    try { creation = parseProjectCreationIntent(prompt); } catch (error) { return { kind: "none", message: error instanceof Error ? error.message : "Invalid project creation request." }; }
    if (creation) return this.createProjectWorkspace(creation);
    if (/\b(create|make|generate|scaffold)\b/i.test(prompt) && /\b(documents|documets|downloads|desktop|projects|home)\b/i.test(prompt)) return { kind: "none", message: "A project name is required and must contain only letters, numbers, _, -, or ." };
    const location = this.extractLocation(prompt);
    const project = this.extractProjectName(prompt);
    const creating = /\b(create|make|generate|scaffold|build)\b/i.test(prompt);
    if (location && project) {
      const target = path.join(this.userRoot, location, project);
      if (creating) {
        try { const safe = assertWithinUserRoot(target, this.userRoot); fs.mkdirSync(safe, { recursive: false }); return { kind: "resolved", workspace: this.setActiveWorkspace(safe, "created"), source: "created" }; }
        catch (error) { if (fs.existsSync(target)) return this.resolvePath(target, "automatic"); return { kind: "none", message: error instanceof Error ? error.message : "Unable to create workspace." }; }
      }
      return this.resolvePath(target, "automatic");
    }
    if (location && !project && !creating) {
      const candidates = this.projectDirectories(path.join(this.userRoot, location), 2);
      if (candidates.length === 1) return this.resolvePath(candidates[0]!, "automatic");
      return candidates.length > 1 ? { kind: "ambiguous", candidates, message: "Multiple projects found; select one." } : { kind: "none", message: "No project found in that location." };
    }
    if (project) {
      const candidates = this.findProjects(project);
      if (candidates.length === 1) return this.resolvePath(candidates[0]!, "automatic");
      if (candidates.length > 1) return { kind: "ambiguous", candidates, message: `Multiple projects match '${project}'.` };
      return { kind: "none", message: `No project named '${project}' was found.` };
    }
    if (this.active) return { kind: "resolved", workspace: this.active, source: this.source };
    return { kind: "none", message: "No active workspace is selected. Which project should I inspect?" };
  }
  private createProjectWorkspace(intent: ProjectCreationIntent): WorkspaceResolution {
    try {
      const parent = resolveKnownLocation(intent.location, this.userRoot);
      const target = assertWithinUserRoot(path.resolve(parent, intent.projectName), this.userRoot);
      if (path.dirname(target) !== path.resolve(parent)) throw new Error("Project path must be directly inside the selected location.");
      fs.mkdirSync(parent, { recursive: true });
      const existed = fs.existsSync(target); if (!existed) fs.mkdirSync(target);
      const workspace = this.setActiveWorkspace(target, existed ? "automatic" : "created");
      return { kind: "resolved", workspace, source: existed ? "automatic" : "created", message: `Workspace resolved: ${target}` };
    } catch (error) { return { kind: "none", message: error instanceof Error ? error.message : "Unable to create workspace." }; }
  }
  private resolvePath(target: string, source: WorkspaceSource): WorkspaceResolution {
    try { return { kind: "resolved", workspace: this.setActiveWorkspace(target, source), source }; } catch (error) { return { kind: "none", message: error instanceof Error ? error.message : "Invalid workspace." }; }
  }
  private extractExplicitPath(prompt: string): string | undefined {
    const match = prompt.match(/(?:~\/[^\s,]+|\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)/); return match?.[0];
  }
  private extractLocation(prompt: string): string | undefined {
    const matches = [...prompt.matchAll(/\b(downloads|documents|documets|desktop|projects)\b/gi)];
    const match = matches.at(-1); if (!match) return undefined;
    const desired = match[1]!.toLowerCase() === "documets" ? "documents" : match[1]!.toLowerCase(); const entries = fs.readdirSync(this.userRoot, { withFileTypes: true });
    return entries.find((entry) => entry.isDirectory() && entry.name.toLowerCase() === desired)?.name ?? (desired === "projects" ? "Projects" : desired[0]!.toUpperCase() + desired.slice(1));
  }
  private extractProjectName(prompt: string): string | undefined {
    const named = prompt.match(/\b(?:named|called)\s+([\w.-]+)/i); if (named) return named[1];
    const inLocation = prompt.match(/\b(?:of|in)\s+(?:the\s+)?([\w.-]+)\s+(?:folder\s+)?in\s+(?:the\s+)?(?:downloads|documents|desktop|projects?)\b/i);
    if (inLocation) return inLocation[1];
    return prompt.match(/\b(?:of|in)\s+(?:the\s+)?([\w.-]+)(?:\s+project|\s+folder)?\b/i)?.[1];
  }
  private findProjects(name: string): string[] { return this.projectDirectories(this.userRoot, 3).filter((candidate) => path.basename(candidate).toLowerCase() === name.toLowerCase()); }
  private projectDirectories(root: string, depth: number): string[] {
    if (!fs.existsSync(root) || depth < 0) return []; const results: string[] = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || ["node_modules", ".git", ".cache"].includes(entry.name)) continue;
      const full = path.join(root, entry.name); const marker = [".git", "package.json", "Cargo.toml", "pyproject.toml", "go.mod", "pom.xml", "build.gradle", "docker-compose.yml"].some((file) => fs.existsSync(path.join(full, file)));
      if (marker) results.push(full); if (depth > 0) results.push(...this.projectDirectories(full, depth - 1));
    }
    return results;
  }
  private emit() { const scope = this.getScope(); for (const listener of this.listeners) listener(scope); }
}
