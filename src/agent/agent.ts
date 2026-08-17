import type { OnToolActivityCallback, ModelMode } from "../models/model.js";
import type { ApprovalHandler } from "./executor.js";
import { filesystemTools } from "../tools/definitions.js";
import { runWithRouter } from "../models/router.js";
import type { Workspace } from "../workspace/workspace.js";

export async function runAgent(
  prompt: string,
  workspace: Workspace,
  mode: ModelMode = "auto",
  onToolActivity?: OnToolActivityCallback,
  onApprovalRequest?: ApprovalHandler
): Promise<string> {
  return runWithRouter(
    prompt,
    workspace,
    filesystemTools,
    { mode },
    onToolActivity,
    onApprovalRequest
  );
}
