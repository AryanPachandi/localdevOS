import type { Workspace } from "../workspace/workspace.js";
import type { TaskRoute, ModelClient, OnToolActivityCallback } from "../models/model.js";
import type { ApprovalHandler } from "./executor.js";
import { filesystemTools } from "../tools/definitions.js";
import { modelRegistry } from "../models/router.js";
import type { Message } from "ollama";

export interface MultiStepPlan {
  steps: Array<{
    id: string;
    description: string;
    assignedModel: "gemini" | "gpt-oss" | "llama";
  }>;
}

export async function runMixedTaskPlan(
  prompt: string,
  workspace: Workspace,
  onToolActivity?: OnToolActivityCallback,
  onApprovalRequest?: ApprovalHandler
): Promise<string> {
  console.log("🧩 Planner: Executing mixed multi-model workflow (Gemini Reasoning → GPT-OSS Implementation)");

  const gemini = modelRegistry.get("gemini");
  const gptOss = modelRegistry.get("gpt-oss");

  if (!gemini || !gptOss) {
    throw new Error("Models required for mixed task workflow are missing.");
  }

  const systemMsg: Message = {
    role: "system",
    content: `Workspace: ${workspace.name} (${workspace.root}). All operations relative to workspace root.`,
  };

  // Step 1: Gemini Analysis & Architecture Planning
  if (onToolActivity) {
    onToolActivity({
      id: `plan_step1_${Date.now()}`,
      name: "planner",
      args: { step: 1, model: "gemini" },
      status: "running",
      result: "⚡ Step 1/2: Gemini analyzing problem & planning fix",
      timestamp: Date.now(),
    });
  }

  const analysisPrompt = `Analysis Phase for Mixed Task: ${prompt}\n\nPlease analyze the root cause and outline the precise implementation plan.`;
  const planResult = await gemini.chat(
    [systemMsg, { role: "user", content: analysisPrompt }],
    filesystemTools,
    workspace,
    onToolActivity,
    onApprovalRequest
  );

  // Step 2: GPT-OSS Code Implementation & Verification
  if (onToolActivity) {
    onToolActivity({
      id: `plan_step2_${Date.now()}`,
      name: "planner",
      args: { step: 2, model: "gpt-oss" },
      status: "running",
      result: "⚡ Step 2/2: GPT-OSS 120B Cloud implementing fix & writing tests",
      timestamp: Date.now(),
    });
  }

  const codingPrompt = `Implementation Phase for Mixed Task:\nOriginal Goal: ${prompt}\n\nArchitecture & Debugging Plan from Gemini:\n${planResult}\n\nPlease implement the code changes, update necessary files, and execute relevant tests.`;
  const codingResult = await gptOss.chat(
    [systemMsg, { role: "user", content: codingPrompt }],
    filesystemTools,
    workspace,
    onToolActivity,
    onApprovalRequest
  );

  return `### Analysis & Planning (Gemini 3.5 Flash)\n${planResult}\n\n---\n\n### Implementation & Engineering (GPT-OSS 120B Cloud)\n${codingResult}`;
}
