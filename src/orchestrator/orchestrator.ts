import type { Message } from "ollama";
import { modelRegistry } from "../models/router.js";
import type { ModelClient, OnToolActivityCallback } from "../models/model.js";
import { filesystemTools } from "../tools/definitions.js";
import { executeTool, type ApprovalHandler } from "../agent/executor.js";
import { runGoalVerification } from "../agent/verifier.js";
import type { Workspace } from "../workspace/workspace.js";
import { detectUnstagedSecrets, gitStatusPorcelain } from "../tools/git.js";
import { TaskGraph } from "./taskGraph.js";
import { classifyFailure } from "./policies.js";
import type { OrchestratorEvent, TaskPlan, TaskState, VerificationResult } from "./types.js";

export interface OrchestratorOptions { clients?: Map<string, ModelClient>; execute?: typeof executeTool; verify?: (workspace: Workspace, goal: string, requireRemote?: boolean) => Promise<VerificationResult>; onEvent?: (event: OrchestratorEvent) => void; }
const locks = new Set<string>();
export class Orchestrator {
  private readonly clients; private readonly execute; private readonly verify;
  constructor(private readonly options: OrchestratorOptions = {}) { this.clients = options.clients ?? modelRegistry; this.execute = options.execute ?? executeTool; this.verify = options.verify ?? runGoalVerification; }
  private emit(workspace: Workspace, type: OrchestratorEvent["type"], task?: TaskState, detail?: string) { this.options.onEvent?.({ type, timestamp: Date.now(), workspace: workspace.root, ...(task ? { taskId: task.id, model: task.model, status: task.status } : {}), ...(detail === undefined ? {} : { detail }) }); }
  async run(plan: TaskPlan, workspace: Workspace, activity?: OnToolActivityCallback, approval?: ApprovalHandler): Promise<TaskPlan> {
    if (locks.has(workspace.root)) throw new Error(`Workspace is already executing: ${workspace.root}`);
    locks.add(workspace.root); const graph = new TaskGraph(plan); this.emit(workspace, "plan_created");
    try {
      while (true) {
        const ready = graph.ready();
        for (const task of ready) { task.status = "ready"; this.emit(workspace, "task_ready", task); }
        const next = graph.plan.tasks.find((task) => task.status === "ready");
        if (!next) break;
        await this.runTask(next, plan, workspace, activity, approval);
        if (next.status === "failed" || next.status === "cancelled" || next.status === "awaiting_approval") {
          for (const blocked of graph.blockDependents(next.id)) this.emit(workspace, "task_blocked", blocked, `Dependency ${next.id} did not complete`);
        }
      }
      this.emit(workspace, "agent_completed"); return plan;
    } finally { locks.delete(workspace.root); }
  }
  private async runTask(task: TaskState, plan: TaskPlan, workspace: Workspace, activity?: OnToolActivityCallback, approval?: ApprovalHandler) {
    task.status = "running"; task.startedAt = Date.now(); task.attempts++; this.emit(workspace, "task_started", task);
    try {
      const result = await this.withTimeout(this.executeTask(task, plan, workspace, activity, approval), task.timeoutMs, task.description);
      task.result = result; task.status = "completed"; task.completedAt = Date.now(); this.emit(workspace, "task_completed", task);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error); const kind = classifyFailure(message);
      if (kind === "security") task.status = "awaiting_approval";
      else if (task.attempts < task.maxAttempts && (kind === "model_failure" || kind === "code_failure" || kind === "transient")) {
        task.status = "retrying"; this.emit(workspace, "recovery_started", task, message);
        await this.recover(task, plan, workspace, activity, approval, message); return;
      } else task.status = "failed";
      task.error = { message, kind }; task.completedAt = Date.now(); this.emit(workspace, task.status === "awaiting_approval" ? "approval_required" : "task_failed", task, message);
    }
  }
  private async recover(task: TaskState, plan: TaskPlan, workspace: Workspace, activity: OnToolActivityCallback | undefined, approval: ApprovalHandler | undefined, failure: string) {
    if (task.model === "gpt-oss" && task.attempts >= 2) {
      const gemini = this.clients.get("gemini");
      if (gemini) await gemini.chat([{ role: "user", content: `Analyze this failed task and provide concise repair guidance. Do not claim completion. Task: ${task.description}\nFailure: ${failure}` }], filesystemTools, workspace, activity, approval);
    }
    await this.runTask(task, plan, workspace, activity, approval);
  }
  private async executeTask(task: TaskState, plan: TaskPlan, workspace: Workspace, activity?: OnToolActivityCallback, approval?: ApprovalHandler): Promise<unknown> {
    if (task.type === "verification") { this.emit(workspace, "verification_started", task); const result = await this.verify(workspace, plan.goal, task.description.includes("remote")); task.verification = result; this.emit(workspace, "verification_completed", task, result.summary); if (result.status !== "passed") throw new Error(result.summary); return result; }
    if (task.type === "shell" || task.type === "testing") { const build = await this.execute("run_build", {}, workspace, approval); if (!isOk(build)) throw new Error(errorOf(build)); const tests = await this.execute("run_tests", {}, workspace, approval); if (!isOk(tests)) throw new Error(errorOf(tests)); return { build, tests }; }
    if (task.type === "github" || task.type === "git") return this.runGitGate(task, workspace, approval);
    const client = this.clients.get(task.model ?? "llama"); if (!client) throw new Error(`No model configured for ${task.model}`); this.emit(workspace, "model_selected", task);
    const prompt = `Execution context: workspace=${workspace.root}; projectRoot=${workspace.root}; taskId=${task.id}; planId=${plan.id}.\nComplete only this task: ${task.description}\nGoal: ${plan.goal}\nUse tools where needed. Do not say completed unless the requested work is actually done. A model iteration limit is a failure.`;
    const output = await client.chat([{ role: "system", content: `All work must remain in ${workspace.root}.` } as Message, { role: "user", content: prompt }], filesystemTools, workspace, activity, approval);
    if (/maximum iteration|iteration limit|execution stopped/i.test(output)) throw new Error(`Model failure: ${output}`);
    return output;
  }
  private async runGitGate(task: TaskState, workspace: Workspace, approval?: ApprovalHandler) {
    const root = await this.execute("execute_shell", { command: "git rev-parse --show-toplevel" }, workspace, approval); if (!isOk(root) || String(root.data).trim() !== workspace.root) throw new Error("Git root does not match project root");
    const status = await gitStatusPorcelain(workspace); if (!status.ok) throw new Error(status.error.message);
    if (!status.data.trim()) throw new Error("Empty commit prevention: no project changes to commit");
    if (task.type === "github") { const secrets = await detectUnstagedSecrets(workspace); if (secrets.hasSecrets) throw new Error(`Secret files require approval: ${secrets.secretFiles.join(", ")}`); return this.execute("deploy_to_github", { repoName: workspace.name }, workspace, approval); }
    return { root: root.data, status: status.data };
  }
  private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> { let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms); })]); } finally { if (timer) clearTimeout(timer); } }
}
function isOk(value: unknown): value is { ok: true; data: unknown } { return !!value && typeof value === "object" && (value as { ok?: boolean }).ok === true; }
function errorOf(value: unknown): string { const v = value as { error?: { message?: string } }; return v?.error?.message ?? "Deterministic operation failed"; }
