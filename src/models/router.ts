import type { Message, Tool } from "ollama";
import type { ModelMode, ModelProvider, TaskRoute, ModelClient, OnToolActivityCallback } from "./model.js";
import { ollamaModel } from "./ollama.js";
import { geminiModel } from "./gemini.js";
import { gptOssModel } from "./gptOss.js";
import type { Workspace } from "../workspace/workspace.js";
import type { ApprovalHandler } from "../agent/executor.js";

export const modelRegistry = new Map<ModelProvider, ModelClient>([
  ["llama", ollamaModel],
  ["gemini", geminiModel],
  ["gpt-oss", gptOssModel],
]);

export interface ModelRouterOptions {
  mode?: ModelMode;
  maxLocalAttempts?: number;
}

export function selectRoute(prompt: string, mode?: ModelMode): TaskRoute {
  const selectedMode = mode || (process.env.MODEL_ROUTING as ModelMode) || "auto";

  // Manual Mode Overrides
  if (selectedMode === "llama" || selectedMode === "local") {
    return {
      complexity: "simple",
      taskType: "general",
      model: "llama",
      reason: "Manual selection: Llama 3.2 (Local)",
    };
  }

  if (selectedMode === "gemini") {
    return {
      complexity: "complex",
      taskType: "reasoning",
      model: "gemini",
      reason: "Manual selection: Gemini 3.5 Flash (Cloud)",
    };
  }

  if (selectedMode === "gpt-oss") {
    return {
      complexity: "complex",
      taskType: "coding",
      model: "gpt-oss",
      reason: "Manual selection: GPT-OSS 120B Cloud",
    };
  }

  // AUTO Mode: Deterministic classification based on prompt requirements
  const lower = prompt.toLowerCase();

  // 1. Explicit user model requests
  if (
    lower.includes("use gpt-oss") ||
    lower.includes("use gpt oss") ||
    lower.includes("gpt-oss") ||
    lower.includes("gpt oss") ||
    lower.includes("120b")
  ) {
    return {
      complexity: "complex",
      taskType: "coding",
      model: "gpt-oss",
      reason: "User explicitly requested GPT-OSS 120B Cloud",
    };
  }

  if (lower.includes("use gemini") || lower.includes("gemini 3.5") || lower.includes("escalate to gemini")) {
    return {
      complexity: "complex",
      taskType: "reasoning",
      model: "gemini",
      reason: "User explicitly requested Gemini 3.5 Flash",
    };
  }

  if (lower.includes("use llama") || lower.includes("llama 3.2") || lower.includes("use local model")) {
    return {
      complexity: "simple",
      taskType: "general",
      model: "llama",
      reason: "User explicitly requested Llama 3.2 (Local)",
    };
  }

  // 2. GPT-OSS 120B Cloud Triggers: Coding, Code Review, Testing, Refactoring & Implementation
  const gptOssPatterns = [
    // Tests & Test generation
    "write test",
    "write tests",
    "generate test",
    "create test",
    "test cases",
    "write unit test",
    "run tests and fix",
    "fix failures",
    "test generation",
    // Code Review & Diff Audit
    "review my changes",
    "code review",
    "review this code",
    "review git diff",
    "review my git diff",
    "review my",
    "review",
    "find bugs",
    "security review",
    "performance review",
    "security issues",
    // Implementation & Refactoring
    "refactor",
    "implement feature",
    "implement jwt",
    "implement authentication",
    "implement",
    "implementation changes",
    "modify source files",
    "write code",
    "fix typescript error",
    "fix bug and run",
    "fix code",
    "fix implementation",
    "add feature",
    "multi-file",
  ];

  if (gptOssPatterns.some((pattern) => lower.includes(pattern))) {
    return {
      complexity: "complex",
      taskType: lower.includes("test") ? "testing" : lower.includes("review") ? "review" : "coding",
      model: "gpt-oss",
      reason: lower.includes("test")
        ? "code generation + testing"
        : lower.includes("review")
        ? "code review & audit"
        : "software engineering & refactoring",
    };
  }

  // 3. Gemini 3.5 Flash Triggers: Complex Reasoning, Architecture, Deep Debugging
  const geminiPatterns = [
    "why is my application crashing",
    "why is app crashing",
    "why is authentication failing",
    "why is",
    "root cause",
    "concurrency bug",
    "race condition",
    "memory leak",
    "deep debugging",
    "debug",
    "analyze architecture",
    "architecture of this application",
    "design a better architecture",
    "design architecture",
    "architecture",
    "analyze",
    "architectural tradeoffs",
    "difficult production issue",
    "analyze this large codebase",
    "components interact",
    "complex deployment planning",
  ];

  if (geminiPatterns.some((pattern) => lower.includes(pattern))) {
    return {
      complexity: "complex",
      taskType: lower.includes("architecture") || lower.includes("analyze")
        ? "architecture"
        : lower.includes("debug") || lower.includes("crash") || lower.includes("root cause")
        ? "debugging"
        : "reasoning",
      model: "gemini",
      reason: lower.includes("architecture") || lower.includes("analyze")
        ? "architectural analysis"
        : lower.includes("root cause") || lower.includes("crash")
        ? "complex root-cause debugging"
        : "complex multi-step reasoning",
    };
  }

  // 4. Default: Llama 3.2 Local General Agent
  let defaultTaskType: TaskRoute["taskType"] = "general";
  if (lower.includes("file") || lower.includes("directory") || lower.includes("src") || lower.includes("package.json")) {
    defaultTaskType = "filesystem";
  } else if (lower.includes("git status") || lower.includes("git diff") || lower.includes("git log")) {
    defaultTaskType = "git";
  } else if (lower.includes("docker")) {
    defaultTaskType = "docker";
  }

  return {
    complexity: "simple",
    taskType: defaultTaskType,
    model: "llama",
    reason: "fast local deterministic query",
  };
}

export async function runWithRouter(
  prompt: string,
  workspace: Workspace,
  tools: Tool[],
  options: ModelRouterOptions = {},
  onToolActivity?: OnToolActivityCallback,
  onApprovalRequest?: ApprovalHandler
): Promise<string> {
  const route = selectRoute(prompt, options.mode);
  console.log(`🧭 Router Selected: ${route.model.toUpperCase()} [Task: ${route.taskType}, Reason: ${route.reason}]`);

  // Report initial routing decisions to UI
  if (onToolActivity) {
    onToolActivity({
      id: `route_${Date.now()}`,
      name: "model_router",
      args: { model: route.model, complexity: route.complexity, taskType: route.taskType },
      status: "completed",
      result: `Auto → ${route.model === "gpt-oss" ? "GPT-OSS 120B" : route.model === "gemini" ? "Gemini 3.5 Flash" : "Llama 3.2"} (Reason: ${route.reason})`,
      timestamp: Date.now(),
    });
  }

  const systemMsg: Message = {
    role: "system",
    content: `Workspace: ${workspace.name} (${workspace.root}). All operations relative to workspace root.`,
  };

  const initialMessages: Message[] = [systemMsg, { role: "user", content: prompt }];

  // Attempt execution with primary routed model
  const primaryClient = modelRegistry.get(route.model) || ollamaModel;

  try {
    return await primaryClient.chat(initialMessages, tools, workspace, onToolActivity, onApprovalRequest);
  } catch (primaryError) {
    const errorMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
    console.warn(`⚠️ Model ${route.model} failed (${errorMsg}). Initiating fallback...`);

    // Determine fallback target model
    let fallbackProvider: ModelProvider;
    if (route.model === "gpt-oss") {
      fallbackProvider = "gemini";
    } else if (route.model === "gemini") {
      fallbackProvider = "gpt-oss";
    } else {
      fallbackProvider = "gemini";
    }

    if (onToolActivity) {
      onToolActivity({
        id: `fallback_${Date.now()}`,
        name: "model_router",
        args: { failedModel: route.model, fallbackModel: fallbackProvider, error: errorMsg },
        status: "completed",
        result: `⚡ ${route.model} unavailable. Falling back to ${fallbackProvider === "gpt-oss" ? "GPT-OSS 120B" : fallbackProvider === "gemini" ? "Gemini 3.5 Flash" : "Llama 3.2"}`,
        timestamp: Date.now(),
      });
    }

    const fallbackClient = modelRegistry.get(fallbackProvider) || geminiModel;
    const enrichedPrompt = `Original Task: ${prompt}\n\nNote: Primary model (${route.model}) experienced an error: ${errorMsg}\n\nPlease take over and complete the task.`;

    try {
      return await fallbackClient.chat(
        [systemMsg, { role: "user", content: enrichedPrompt }],
        tools,
        workspace,
        onToolActivity,
        onApprovalRequest
      );
    } catch (fallbackError) {
      // Final fallback to Llama 3.2 if initial primary/fallback was cloud
      if (route.model !== "llama") {
        console.warn("⚠️ Fallback cloud model failed. Attempting final local fallback to Llama 3.2...");
        return ollamaModel.chat(initialMessages, tools, workspace, onToolActivity, onApprovalRequest);
      }
      throw fallbackError;
    }
  }
}
