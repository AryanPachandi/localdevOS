import type { Message, Tool } from "ollama";
import type { Workspace } from "../workspace/workspace.js";
import type { ApprovalHandler } from "../agent/executor.js";

export type ModelProvider = "llama" | "gemini" | "gpt-oss";

export type ModelMode = "auto" | "llama" | "gemini" | "gpt-oss" | "local";

export type TaskComplexity = "simple" | "medium" | "complex";

export type TaskType =
  | "filesystem"
  | "git"
  | "shell"
  | "docker"
  | "reasoning"
  | "architecture"
  | "debugging"
  | "coding"
  | "testing"
  | "review"
  | "deployment"
  | "general";

export interface TaskRoute {
  complexity: TaskComplexity;
  taskType: TaskType;
  model: ModelProvider;
  reason: string;
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
