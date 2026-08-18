import type { Message, Tool } from "ollama";
import type { ModelMode, ModelProvider, TaskRoute, ModelClient, OnToolActivityCallback, TaskClassification, TaskCategory } from "./model.js";
import { ollamaModel } from "./ollama.js";
import { geminiModel } from "./gemini.js";
import { gptOssModel } from "./gptOss.js";
import type { Workspace } from "../workspace/workspace.js";
import type { ApprovalHandler } from "../agent/executor.js";
import { recordTaskTelemetry } from "../telemetry/opik.js";

export const modelRegistry = new Map<ModelProvider, ModelClient>([
  ["llama", ollamaModel],
  ["gemini", geminiModel],
  ["gpt-oss", gptOssModel],
]);

export interface ModelRouterOptions {
  mode?: ModelMode;
  maxLocalAttempts?: number;
}

const TASK_ROUTING: Record<
  TaskCategory,
  {
    complexity: TaskRoute["complexity"];
    model: ModelProvider | null;
    tools: string[];
    executionMode: TaskRoute["executionMode"];
    maxIterations: number;
    reason: string;
  }
> = {
  READ_FILESYSTEM: { complexity: "simple", model: null, tools: ["list_files", "list_tree", "read_file"], executionMode: "tool_first", maxIterations: 1, reason: "Filesystem inspection is deterministic and should be handled with tools first." },
  WRITE_FILESYSTEM: { complexity: "simple", model: null, tools: ["write_file"], executionMode: "tool_first", maxIterations: 1, reason: "Direct filesystem writes are deterministic and do not need a coding model." },
  GIT: { complexity: "simple", model: null, tools: ["git_status"], executionMode: "tool_first", maxIterations: 2, reason: "Git status and diff are direct tool operations; only explain if needed." },
  DOCKER: { complexity: "simple", model: null, tools: ["docker_ps"], executionMode: "tool_first", maxIterations: 3, reason: "Container inspection is deterministic and tool-driven." },
  TESTING: { complexity: "simple", model: null, tools: ["run_tests"], executionMode: "tool_first", maxIterations: 5, reason: "Testing should run with built-in test tooling before any model is considered." },
  CODING: { complexity: "complex", model: "gpt-oss", tools: ["write_file", "read_file"], executionMode: "agent", maxIterations: 12, reason: "Coding is best handled by GPT-OSS unless the task is simple enough to route elsewhere." },
  REASONING: { complexity: "complex", model: "gemini", tools: ["search_files"], executionMode: "agent", maxIterations: 10, reason: "Complex multi-step reasoning should be routed to Gemini." },
  RESEARCH: { complexity: "medium", model: "llama", tools: ["search_files"], executionMode: "agent", maxIterations: 5, reason: "Research can use a light local model when it requires synthesis." },
  GENERAL: { complexity: "simple", model: "llama", tools: [], executionMode: "agent", maxIterations: 8, reason: "General small questions can use the local model." },
};

export function classifyTask(prompt: string): TaskClassification {
  const lower = prompt.toLowerCase();

  if (/\b(git status|git diff|git log|show my git|show git|status of .*git|git of)\b/.test(lower)) {
    return { ...TASK_ROUTING.GIT, taskType: "GIT" };
  }

  if (/\b(show|list|explore|find|what files|what are the files|project tree|tree|directory|src|package\.json|read package|read file|all files|show me files)\b/.test(lower)) {
    return { ...TASK_ROUTING.READ_FILESYSTEM, taskType: "READ_FILESYSTEM" };
  }

  if (/\b(docker|containers are running|what containers|docker ps|compose up|docker compose)\b/.test(lower)) {
    return { ...TASK_ROUTING.DOCKER, taskType: "DOCKER" };
  }

  if (/\b(run tests|test suite|npm test|vitest|jest|run the tests|execute tests|pytest|cargo test)\b/.test(lower)) {
    return { ...TASK_ROUTING.TESTING, taskType: "TESTING" };
  }

  if (/\b(create a .*project|create .*project|scaffold|next\.js|nextjs|react app|fix this .*bug|fix .*typescript bug|write code|implement feature|write tests|modify code|create .* app|create .*website)\b/.test(lower)) {
    return { ...TASK_ROUTING.CODING, taskType: "CODING" };
  }

  if (/\b(design .*architecture|architectural|scalable architecture|root cause|why is .* crashing|why is .* failing|analyze .*codebase|analyze architecture|complex reasoning)\b/.test(lower)) {
    return { ...TASK_ROUTING.REASONING, taskType: "REASONING" };
  }

  if (/\b(search|research|compare|find docs|summarize|look up)\b/.test(lower)) {
    return { ...TASK_ROUTING.RESEARCH, taskType: "RESEARCH" };
  }

  if (/\b(write .*file|create .*file|delete .*file|rename .*file|update .*file)\b/.test(lower)) {
    return { ...TASK_ROUTING.WRITE_FILESYSTEM, taskType: "WRITE_FILESYSTEM" };
  }

  return { ...TASK_ROUTING.GENERAL, taskType: "GENERAL" };
}

export function selectRoute(prompt: string, mode?: ModelMode): TaskRoute {
  const selectedMode = mode || (process.env.MODEL_ROUTING as ModelMode) || "auto";

  if (selectedMode === "llama" || selectedMode === "local") {
    return { ...TASK_ROUTING.GENERAL, taskType: "GENERAL", model: "llama", reason: "Manual selection: Llama 3.2 (Local)" };
  }

  if (selectedMode === "gemini") {
    return { ...TASK_ROUTING.REASONING, taskType: "REASONING", model: "gemini", reason: "Manual selection: Gemini 3.5 Flash (Cloud)" };
  }

  if (selectedMode === "gpt-oss") {
    return { ...TASK_ROUTING.CODING, taskType: "CODING", model: "gpt-oss", reason: "Manual selection: GPT-OSS 120B Cloud" };
  }

  const classification = classifyTask(prompt);
  return { ...classification, taskType: classification.taskType, model: classification.model, reason: classification.reason };
}

export async function runWithRouter(
  prompt: string,
  workspace: Workspace,
  tools: Tool[],
  options: ModelRouterOptions = {},
  onToolActivity?: OnToolActivityCallback,
  onApprovalRequest?: ApprovalHandler
): Promise<string> {
  const startedAt = Date.now();
  const route = selectRoute(prompt, options.mode);
  console.log(`🧭 Router Selected: ${route.model ? route.model.toUpperCase() : "TOOL-FIRST"} [Task: ${route.taskType}, Reason: ${route.reason}]`);

  if (onToolActivity) {
    onToolActivity({
      id: `route_${Date.now()}`,
      name: "model_router",
      args: { model: route.model, complexity: route.complexity, taskType: route.taskType, executionMode: route.executionMode },
      status: "completed",
      result: route.model ? `Auto → ${route.model === "gpt-oss" ? "GPT-OSS 120B" : route.model === "gemini" ? "Gemini 3.5 Flash" : "Llama 3.2"} (Reason: ${route.reason})` : `Tool-first route: ${route.taskType} (Reason: ${route.reason})`,
      timestamp: Date.now(),
    });
  }

  if (route.executionMode === "tool_first" || route.model === null) {
    await recordTaskTelemetry({
      taskType: route.taskType,
      executionMode: route.executionMode,
      selectedModel: null,
      workspace: workspace.root,
      toolCalls: route.tools,
      iterations: route.maxIterations,
      durationMs: Date.now() - startedAt,
      success: true,
    });
    return `Deterministic task classified as ${route.taskType}. Tool-first execution is required; no model call has been made.`;
  }

  const systemMsg: Message = {
    role: "system",
    content: `Workspace: ${workspace.name} (${workspace.root}). All operations relative to workspace root.`,
  };

  const initialMessages: Message[] = [systemMsg, { role: "user", content: prompt }];
  const primaryClient = modelRegistry.get(route.model) || ollamaModel;

  try {
    const result = await primaryClient.chat(initialMessages, tools, workspace, onToolActivity, onApprovalRequest);
    await recordTaskTelemetry({
      taskType: route.taskType,
      executionMode: route.executionMode,
      selectedModel: route.model,
      workspace: workspace.root,
      toolCalls: route.tools,
      iterations: route.maxIterations,
      durationMs: Date.now() - startedAt,
      success: true,
    });
    return result;
  } catch (primaryError) {
    const errorMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
    console.warn(`⚠️ Model ${route.model} failed (${errorMsg}). Initiating fallback...`);

    const fallbackProvider = route.model === "gpt-oss" ? "gemini" : route.model === "gemini" ? "gpt-oss" : "gemini";
    if (onToolActivity) {
      onToolActivity({
        id: `fallback_${Date.now()}`,
        name: "model_router",
        args: { failedModel: route.model, fallbackModel: fallbackProvider, error: errorMsg },
        status: "completed",
        result: `⚡ ${route.model} unavailable. Falling back to ${fallbackProvider === "gpt-oss" ? "GPT-OSS 120B" : "Gemini 3.5 Flash"}`,
        timestamp: Date.now(),
      });
    }

    const fallbackClient = modelRegistry.get(fallbackProvider) || geminiModel;
    const enrichedPrompt = `Original Task: ${prompt}\n\nNote: Primary model (${route.model}) experienced an error: ${errorMsg}\n\nPlease take over and complete the task.`;

    try {
      const fallbackResult = await fallbackClient.chat([systemMsg, { role: "user", content: enrichedPrompt }], tools, workspace, onToolActivity, onApprovalRequest);
      await recordTaskTelemetry({
        taskType: route.taskType,
        executionMode: route.executionMode,
        selectedModel: fallbackProvider,
        workspace: workspace.root,
        toolCalls: route.tools,
        iterations: route.maxIterations,
        durationMs: Date.now() - startedAt,
        success: true,
      });
      return fallbackResult;
    } catch (fallbackError) {
      if (route.model !== "llama") {
        console.warn("⚠️ Fallback cloud model failed. Attempting final local fallback to Llama 3.2...");
        const finalResult = await ollamaModel.chat(initialMessages, tools, workspace, onToolActivity, onApprovalRequest);
        await recordTaskTelemetry({
          taskType: route.taskType,
          executionMode: route.executionMode,
          selectedModel: "llama",
          workspace: workspace.root,
          toolCalls: route.tools,
          iterations: route.maxIterations,
          durationMs: Date.now() - startedAt,
          success: true,
        });
        return finalResult;
      }
      await recordTaskTelemetry({
        taskType: route.taskType,
        executionMode: route.executionMode,
        selectedModel: route.model,
        workspace: workspace.root,
        toolCalls: route.tools,
        iterations: route.maxIterations,
        durationMs: Date.now() - startedAt,
        success: false,
      });
      throw fallbackError;
    }
  }
}
