import type { Message, Tool } from "ollama";
import type { Workspace } from "../workspace/workspace.js";
import type { ApprovalHandler } from "../agent/executor.js";

export type ModelProvider = "llama" | "gemini" | "gpt-oss";

export type ModelMode = "auto" | "llama" | "gemini" | "gpt-oss" | "local";

export type TaskComplexity = "simple" | "medium" | "complex";

export type TaskCategory =
  | "READ_FILESYSTEM"
  | "WRITE_FILESYSTEM"
  | "GIT"
  | "DOCKER"
  | "TESTING"
  | "CODING"
  | "REASONING"
  | "RESEARCH"
  | "GENERAL";

export type TaskType =
  | TaskCategory
  | "filesystem"
  | "shell"
  | "git"
  | "github"
  | "docker"
  | "coding"
  | "code_review"
  | "testing"
  | "refactoring"
  | "debugging"
  | "architecture"
  | "reasoning"
  | "verification"
  | "deployment"
  | "general";

export type ExecutionMode = "tool_first" | "agent";

export interface TaskClassification {
  taskType: TaskCategory;
  complexity: TaskComplexity;
  executionMode: ExecutionMode;
  model: ModelProvider | null;
  tools: string[];
  maxIterations: number;
  reason: string;
}

export interface TaskRoute {
  taskType: TaskCategory | TaskType;
  complexity: TaskComplexity;
  executionMode: ExecutionMode;
  model: ModelProvider | null;
  tools: string[];
  maxIterations: number;
  reason: string;
}

export interface PlanStep {
  id: string;
  type: TaskType;
  model: ModelProvider | "verifier";
  description: string;
  status: "pending" | "ready" | "running" | "completed" | "failed" | "blocked" | "retrying" | "cancelled" | "awaiting_approval";
  dependencies?: string[];
  maxAttempts?: number;
  result?: string;
  error?: string;
}

export interface StructuredPlan {
  goal: string;
  workspacePath: string;
  steps: PlanStep[];
  taskPlan?: import("../orchestrator/types.js").TaskPlan;
}

export interface ToolActivityEvent {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
  timestamp: number;
}

export type OnToolActivityCallback = (event: ToolActivityEvent) => void;

export interface ModelClient {
  name: string;
  provider: ModelProvider;
  chat(
    messages: Message[],
    tools: Tool[],
    workspace: Workspace,
    onToolActivity?: OnToolActivityCallback,
    onApprovalRequest?: ApprovalHandler
  ): Promise<string>;
}
