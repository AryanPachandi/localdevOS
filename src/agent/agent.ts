import type { OnToolActivityCallback, ModelMode } from "../models/model.js";
import type { ApprovalHandler } from "./executor.js";
import { executeTool } from "./executor.js";
import { filesystemTools } from "../tools/definitions.js";
import { classifyTask, runWithRouter } from "../models/router.js";
import { createPlan, executePlan } from "./planner.js";
import { Memory } from "../memory/memory.js";
import { detectWorkspaceContext, type Workspace } from "../workspace/workspace.js";

function parseToolTarget(prompt: string): { tool: string; args: Record<string, unknown> } {
  const lower = prompt.toLowerCase();
  const directoryMatch = prompt.match(/(?:in|from|under|inside|of)\s+([A-Za-z0-9._/-]+)/i) ?? prompt.match(/(?:src|app|components|test|tests|docs|public|root)/i);
  const directory = directoryMatch ? directoryMatch[1] || directoryMatch[0] : ".";

  if (/(project tree|tree|show.*files|explore.*files|all files|list files)/i.test(prompt)) {
    return {
      tool: /tree|project tree/i.test(prompt) ? "list_tree" : "list_files",
      args: { directory: /src|app|components|test|tests|docs|public|root/i.test(prompt) ? directory : ".", maxDepth: /tree|project tree/i.test(prompt) ? 3 : undefined },
    };
  }

  if (/(read|show|open)\s+.*\.(json|ts|tsx|js|jsx|md|css|html)/i.test(prompt) || /read package\.json|read .*file/i.test(prompt)) {
    const filePath = prompt.match(/(?:read|show|open)\s+(?:the\s+)?([A-Za-z0-9._/-]+)/i)?.[1] ?? "package.json";
    return { tool: "read_file", args: { filePath } };
  }

  if (/git status|git diff|git log|show my git|show git/i.test(prompt)) {
    return { tool: "git_status", args: {} };
  }

  if (/docker|containers are running|docker ps|compose/i.test(prompt)) {
    return { tool: "docker_ps", args: {} };
  }

  if (/run tests|test suite|npm test|vitest|jest|pytest|cargo test/i.test(prompt)) {
    return { tool: "run_tests", args: {} };
  }

  return { tool: "list_tree", args: { directory: ".", maxDepth: 3 } };
}

export async function runAgent(
  prompt: string,
  workspace: Workspace,
  mode: ModelMode = "auto",
  onToolActivity?: OnToolActivityCallback,
  onApprovalRequest?: ApprovalHandler
): Promise<string> {
  if (!workspace.context) {
    workspace.context = detectWorkspaceContext(workspace);
  }

  const memory = new Memory(workspace.root);
  await memory.load();

  const classification = classifyTask(prompt);
  if (classification.executionMode === "tool_first" && classification.model === null) {
    const route = parseToolTarget(prompt);
    if (onToolActivity) {
      onToolActivity({
        id: `tool_route_${Date.now()}`,
        name: "task_classifier",
        args: { taskType: classification.taskType, executionMode: classification.executionMode, tool: route.tool },
        status: "completed",
        result: `Deterministic route: ${classification.taskType} → ${route.tool}`,
        timestamp: Date.now(),
      });
    }
    const result = await executeTool(route.tool, route.args, workspace, onApprovalRequest);
    if (result && typeof result === "object" && "ok" in result && result.ok === false) {
      const errorResult = result as { error?: { message?: string } };
      return `Tool execution failed: ${errorResult.error?.message ?? "Unknown tool error"}`;
    }
    if (typeof result === "string") return result;
    if (result && typeof result === "object" && "data" in result) {
      const data = (result as { data: unknown }).data;
      if (typeof data === "string") return data;
      return JSON.stringify(data, null, 2);
    }
    return JSON.stringify(result, null, 2);
  }

  if (mode === "auto") {
    console.log(`🤖 LocalDevOS Agent Harness: Planning compound task in workspace [${workspace.root}]`);

    await memory.add("task", prompt, {
      projectType: workspace.context.projectType,
      hasGit: String(workspace.context.gitStatus.isRepo),
    });

    const plan = createPlan(prompt, workspace);
    const result = await executePlan(plan, workspace, onToolActivity, onApprovalRequest);

    await memory.add("decision", `Completed execution plan for: ${prompt}`);
    return result;
  }

  return runWithRouter(
    prompt,
    workspace,
    filesystemTools,
    { mode },
    onToolActivity,
    onApprovalRequest
  );
}
