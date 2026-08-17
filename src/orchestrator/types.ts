import type { ModelProvider, TaskType } from "../models/model.js";

export type TaskStatus = "pending" | "ready" | "running" | "completed" | "failed" | "blocked" | "retrying" | "cancelled" | "awaiting_approval";
export type FailureKind = "transient" | "model_failure" | "tool_failure" | "code_failure" | "configuration" | "permission" | "security" | "workspace" | "user_input" | "unknown";

export interface TaskError { message: string; kind: FailureKind; cause?: unknown; }
export interface VerificationCheck { name: string; passed: boolean; required: boolean; detail: string; }
export interface VerificationResult { status: "passed" | "failed" | "partial"; checks: VerificationCheck[]; summary: string; }
export interface ExecutionContext { workspace: string; projectRoot: string; taskId: string; planId: string; }
export interface TaskState {
  id: string; type: TaskType; description: string; model?: ModelProvider | "verifier";
  status: TaskStatus; dependencies: string[]; attempts: number; maxAttempts: number;
  timeoutMs: number; workspace: string; startedAt?: number; completedAt?: number;
  result?: unknown; error?: TaskError; verification?: VerificationResult;
}
export interface TaskPlan { id: string; goal: string; workspacePath: string; tasks: TaskState[]; }
export interface OrchestratorEvent {
  type: "plan_created" | "task_ready" | "task_started" | "task_completed" | "task_failed" | "task_blocked" | "model_selected" | "tool_started" | "tool_completed" | "verification_started" | "verification_completed" | "approval_required" | "recovery_started" | "agent_completed";
  taskId?: string; timestamp: number; workspace: string; model?: string; status?: TaskStatus; detail?: string;
}
