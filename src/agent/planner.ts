import type { OnToolActivityCallback, PlanStep, StructuredPlan } from "../models/model.js";
import type { Workspace } from "../workspace/workspace.js";
import type { ApprovalHandler } from "./executor.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { createTask } from "../orchestrator/state.js";
import type { TaskPlan, TaskState } from "../orchestrator/types.js";

/** Plans are graphs: a task becomes runnable only after every dependency completed. */
export function createPlan(prompt: string, workspace: Workspace): StructuredPlan {
  const lower = prompt.toLowerCase();
  const deploy = /github|deploy|push/.test(lower);
  const compound = /create|build|make|generate|implement/.test(lower) && deploy;
  const tasks: TaskState[] = [];
  const add = (id: string, type: TaskState["type"], model: NonNullable<TaskState["model"]>, description: string, dependencies: string[] = [], maxAttempts?: number) => tasks.push(createTask({ id, type, model, description, dependencies, workspace: workspace.root, ...(maxAttempts === undefined ? {} : { maxAttempts }) }));
  if (compound) {
    add("prepare", "filesystem", "llama", "Inspect workspace and select an existing project or safe target directory");
    add("implement", "coding", "gpt-oss", "Implement the requested application and functionality", ["prepare"], 3);
    add("review", "code_review", "gpt-oss", "Review implementation for correctness and security", ["implement"], 2);
    add("tests", "testing", "llama", "Run the actual build and test commands", ["review"], 2);
    add("git", "git", "llama", "Validate Git project root and staged project changes", ["tests"]);
    add("pre_deploy_verify", "verification", "verifier", "Verify actual user goal, build, tests, workspace, and Git root", ["git"]);
    add("github", "github", "llama", "Create or update the GitHub repository and push only approved verified project files", ["pre_deploy_verify"]);
    add("final_verify", "verification", "verifier", "Verify actual user goal and remote commit state", ["github"]);
  } else {
    add("work", /test/.test(lower) ? "testing" : "coding", /test/.test(lower) ? "llama" : "gpt-oss", prompt, [], 3);
    add("verify", "verification", "verifier", "Verify actual user goal", ["work"]);
  }
  return { goal: prompt, workspacePath: workspace.root, steps: tasks.map(toStep), taskPlan: { id: `plan-${Date.now()}`, goal: prompt, workspacePath: workspace.root, tasks } };
}

export async function executePlan(plan: StructuredPlan, workspace: Workspace, onToolActivity?: OnToolActivityCallback, onApprovalRequest?: ApprovalHandler): Promise<string> {
  const taskPlan = plan.taskPlan ?? { id: `plan-${Date.now()}`, goal: plan.goal, workspacePath: plan.workspacePath, tasks: plan.steps.map(fromStep) };
  const orchestrator = new Orchestrator({ onEvent: (event) => onToolActivity?.({ id: `${event.type}_${event.taskId ?? "plan"}_${event.timestamp}`, name: "orchestrator", args: { event: event.type, taskId: event.taskId }, status: event.type === "task_failed" || event.type === "task_blocked" ? "failed" : "completed", result: event.detail ?? event.status, timestamp: event.timestamp }) });
  await orchestrator.run(taskPlan, workspace, onToolActivity, onApprovalRequest);
  plan.taskPlan = taskPlan; plan.steps = taskPlan.tasks.map(toStep);
  const complete = taskPlan.tasks.filter((t) => t.status === "completed").length;
  return [`# Task Execution Report: ${plan.goal}`, `**Workspace**: \`${workspace.root}\``, `**Tasks completed**: ${complete}/${taskPlan.tasks.length}`, "", "## Task graph results", ...taskPlan.tasks.map((t) => `- ${icon(t.status)} **${t.id}** — ${t.status}: ${t.description}${t.error ? ` (${t.error.message})` : ""}`)].join("\n");
}
function toStep(task: TaskState): PlanStep { const result = typeof task.result === "string" ? task.result : task.result ? JSON.stringify(task.result) : undefined; return { id: task.id, type: task.type, model: task.model ?? "llama", description: task.description, status: task.status, dependencies: task.dependencies, maxAttempts: task.maxAttempts, ...(result === undefined ? {} : { result }), ...(task.error ? { error: task.error.message } : {}) }; }
function fromStep(step: PlanStep): TaskState { return createTask({ id: step.id, type: step.type, model: step.model, description: step.description, dependencies: step.dependencies ?? [], workspace: "", ...(step.maxAttempts === undefined ? {} : { maxAttempts: step.maxAttempts }) }); }
function icon(status: TaskState["status"]) { return status === "completed" ? "✅" : status === "blocked" ? "⛔" : status === "failed" ? "❌" : status === "retrying" ? "🔁" : "⏳"; }
