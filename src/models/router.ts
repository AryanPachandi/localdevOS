import type { Message, Tool } from "ollama";
import type { ModelMode, OnToolActivityCallback } from "./model.js";
import { ollamaModel } from "./ollama.js";
import { geminiModel } from "./gemini.js";
import type { Workspace } from "../workspace/workspace.js";
import type { ApprovalHandler } from "../agent/executor.js";

export type EscalationReason =
  | "planning_failure"
  | "repeated_tool_failure"
  | "verification_failure"
  | "complex_task"
  | "user_requested";

export interface ModelRouterOptions {
  mode?: ModelMode;
  maxLocalAttempts?: number;
}

export function isExplicitGeminiRequest(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return (
    lower.includes("use gemini") ||
    lower.includes("gemini 3.5") ||
    lower.includes("escalate to gemini") ||
    lower.includes("stronger model") ||
    lower.includes("cloud model")
  );
}

export function isComplexTask(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  const complexKeywords = [
    "refactor architecture",
    "distributed authentication",
    "race condition",
    "memory leak",
    "deep debugging",
    "complex refactor",
  ];
  return complexKeywords.some((kw) => lower.includes(kw));
}

export async function runWithRouter(
  prompt: string,
  workspace: Workspace,
  tools: Tool[],
  options: ModelRouterOptions = {},
  onToolActivity?: OnToolActivityCallback,
  onApprovalRequest?: ApprovalHandler
): Promise<string> {
  const mode = options.mode || (process.env.MODEL_ROUTING as ModelMode) || "auto";

  if (mode === "local") {
    console.log("🔒 Routing: Forced Local (Llama 3.2)");
    const systemMsg: Message = {
      role: "system",
      content: `Workspace: ${workspace.name} (${workspace.root}). All operations relative to workspace root.`,
    };
    return ollamaModel.chat([systemMsg, { role: "user", content: prompt }], tools, workspace, onToolActivity, onApprovalRequest);
  }

  if (mode === "gemini") {
    console.log("☁ Routing: Forced Cloud (Gemini 3.5 Flash)");
    const systemMsg: Message = {
      role: "system",
      content: `Workspace: ${workspace.name} (${workspace.root}). All operations relative to workspace root.`,
    };
    return geminiModel.chat([systemMsg, { role: "user", content: prompt }], tools, workspace, onToolActivity, onApprovalRequest);
  }

  // AUTO Mode: Check explicit or complex task heuristics first
  if (isExplicitGeminiRequest(prompt)) {
    console.log("⚡ Auto Routing: User explicitly requested Gemini.");
    if (onToolActivity) {
      onToolActivity({
        id: `esc_${Date.now()}`,
        name: "model_router",
        args: { mode: "auto", reason: "user_requested" },
        status: "completed",
        result: "⚡ Escalating to Gemini 3.5 Flash",
        timestamp: Date.now(),
      });
    }
    const systemMsg: Message = {
      role: "system",
      content: `Workspace: ${workspace.name} (${workspace.root}). All operations relative to workspace root.`,
    };
    return geminiModel.chat([systemMsg, { role: "user", content: prompt }], tools, workspace, onToolActivity, onApprovalRequest);
  }

  if (isComplexTask(prompt)) {
    console.log("⚡ Auto Routing: Complex task heuristic triggered Gemini.");
    if (onToolActivity) {
      onToolActivity({
        id: `esc_${Date.now()}`,
        name: "model_router",
        args: { mode: "auto", reason: "complex_task" },
        status: "completed",
        result: "⚡ Escalating to Gemini 3.5 Flash",
        timestamp: Date.now(),
      });
    }
    const systemMsg: Message = {
      role: "system",
      content: `Workspace: ${workspace.name} (${workspace.root}). All operations relative to workspace root.`,
    };
    return geminiModel.chat([systemMsg, { role: "user", content: prompt }], tools, workspace, onToolActivity, onApprovalRequest);
  }

  // Attempt local execution with Llama 3.2
  console.log("● Auto Routing: Starting with Llama 3.2 (Local)...");
  const systemMsg: Message = {
    role: "system",
    content: `Workspace: ${workspace.name} (${workspace.root}). All operations relative to workspace root.`,
  };

  let failedToolCount = 0;
  const toolResults: Array<{ name: string; result: unknown; error?: string }> = [];

  const trackingToolActivity: OnToolActivityCallback = (event) => {
    if (event.status === "failed") {
      failedToolCount += 1;
    }
    if (event.status === "completed" || event.status === "failed") {
      const item: { name: string; result: unknown; error?: string } = {
        name: event.name,
        result: event.result,
      };
      if (event.error) {
        item.error = event.error;
      }
      toolResults.push(item);
    }
    if (onToolActivity) onToolActivity(event);
  };

  try {
    const localResult = await ollamaModel.chat(
      [systemMsg, { role: "user", content: prompt }],
      tools,
      workspace,
      trackingToolActivity,
      onApprovalRequest
    );

    // Check if Llama result indicates failure or repeated tool failure
    const isExecutionFailure =
      failedToolCount >= 2 ||
      localResult.includes("TOOL_EXECUTION_FAILED") ||
      localResult.includes("Error:") ||
      localResult.includes("failed to execute");

    if (isExecutionFailure) {
      console.log(`⚡ Llama local execution failed (${failedToolCount} tool errors). Escalating to Gemini 3.5 Flash...`);
      if (onToolActivity) {
        onToolActivity({
          id: `esc_${Date.now()}`,
          name: "model_router",
          args: { mode: "auto", reason: "repeated_tool_failure", failedToolCount },
          status: "completed",
          result: "⚡ Escalating to Gemini 3.5 Flash",
          timestamp: Date.now(),
        });
      }

      // Enrich context for Gemini escalation
      const enrichedPrompt = `Original Task: ${prompt}

Llama 3.2 Attempt Summary:
${localResult}

Tool Executions & Errors:
${JSON.stringify(toolResults, null, 2)}

Please analyze the situation, resolve the issue, and complete the task.`;

      return geminiModel.chat(
        [systemMsg, { role: "user", content: enrichedPrompt }],
        tools,
        workspace,
        onToolActivity,
        onApprovalRequest
      );
    }

    return localResult;
  } catch (error) {
    console.log("⚡ Llama execution exception. Escalating to Gemini 3.5 Flash...");
    if (onToolActivity) {
      onToolActivity({
        id: `esc_${Date.now()}`,
        name: "model_router",
        args: { mode: "auto", reason: "planning_failure" },
        status: "completed",
        result: "⚡ Escalating to Gemini 3.5 Flash",
        timestamp: Date.now(),
      });
    }

    const errorMsg = error instanceof Error ? error.message : "Local model failure.";
    const enrichedPrompt = `Original Task: ${prompt}\n\nLocal model error: ${errorMsg}\n\nPlease take over and complete the task.`;
    return geminiModel.chat(
      [systemMsg, { role: "user", content: enrichedPrompt }],
      tools,
      workspace,
      onToolActivity,
      onApprovalRequest
    );
  }
}
