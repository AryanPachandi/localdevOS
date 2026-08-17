import type { OnToolActivityCallback, ModelMode } from "../models/model.js";
import type { ApprovalHandler } from "./executor.js";
import { filesystemTools } from "../tools/definitions.js";
import { runWithRouter } from "../models/router.js";
import { createPlan, executePlan } from "./planner.js";
import { Memory } from "../memory/memory.js";
import { detectWorkspaceContext, type Workspace } from "../workspace/workspace.js";

export async function runAgent(
  prompt: string,
  workspace: Workspace,
  mode: ModelMode = "auto",
  onToolActivity?: OnToolActivityCallback,
  onApprovalRequest?: ApprovalHandler
): Promise<string> {
  // Ensure workspace context is detected
  if (!workspace.context) {
    workspace.context = detectWorkspaceContext(workspace);
  }

  // Load project memory
  const memory = new Memory(workspace.root);
  await memory.load();

  // In Auto mode, use the full Agent Harness Multi-Step Planner
  if (mode === "auto") {
    console.log(`🤖 LocalDevOS Agent Harness: Planning compound task in workspace [${workspace.root}]`);

    // Record prompt in project memory
    await memory.add("task", prompt, {
      projectType: workspace.context.projectType,
      hasGit: String(workspace.context.gitStatus.isRepo),
    });

    const plan = createPlan(prompt, workspace);
    const result = await executePlan(plan, workspace, onToolActivity, onApprovalRequest);

    // Save execution memory
    await memory.add("decision", `Completed execution plan for: ${prompt}`);
    return result;
  }

  // In Manual override mode, execute directly via router
  return runWithRouter(
    prompt,
    workspace,
    filesystemTools,
    { mode },
    onToolActivity,
    onApprovalRequest
  );
}
