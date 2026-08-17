import type { Message, Tool } from "ollama";
import type { Workspace } from "../workspace/workspace.js";
import type { ApprovalHandler } from "../agent/executor.js";

export type ModelMode = "auto" | "local" | "gemini";

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
  chat(
    messages: Message[],
    tools: Tool[],
    workspace: Workspace,
    onToolActivity?: OnToolActivityCallback,
    onApprovalRequest?: ApprovalHandler
  ): Promise<string>;
}
