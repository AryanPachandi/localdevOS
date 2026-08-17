import type { LocalDevOSApi, ModelMode } from "../electron/preload-types.js";

export type { ModelMode };

declare global {
  interface Window {
    localDevOS: LocalDevOSApi;
  }
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ToolActivityItem {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
  timestamp: number;
}

export interface ApprovalRequest {
  id: string;
  command: string;
  reason: string;
}
