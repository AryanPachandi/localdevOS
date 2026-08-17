import type { FailureKind, TaskState } from "./types.js";

export function classifyFailure(value: unknown): FailureKind {
  const text = value instanceof Error ? value.message : String(value);
  if (/iteration limit|max(?:imum)? iterations/i.test(text)) return "model_failure";
  if (/permission|denied|approval/i.test(text)) return "permission";
  if (/secret|credential|token|\.env/i.test(text)) return "security";
  if (/workspace|project root|outside workspace|git root/i.test(text)) return "workspace";
  if (/npm|build|test|typescript|compile/i.test(text)) return "code_failure";
  if (/timeout|network|temporar/i.test(text)) return "transient";
  if (/tool|shell|git/i.test(text)) return "tool_failure";
  return "unknown";
}
export function defaultTimeout(task: TaskState): number {
  if (task.type === "coding" || task.type === "refactoring") return 5 * 60_000;
  if (task.type === "github" || task.type === "deployment") return 2 * 60_000;
  if (task.type === "shell" || task.type === "testing" || task.type === "verification") return 3 * 60_000;
  return 30_000;
}
