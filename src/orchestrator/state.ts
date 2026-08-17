import type { TaskState } from "./types.js";
export function createTask(input: Omit<TaskState, "status" | "attempts" | "maxAttempts" | "timeoutMs"> & Partial<Pick<TaskState, "maxAttempts" | "timeoutMs">>): TaskState {
  return { ...input, status: "pending", attempts: 0, maxAttempts: input.maxAttempts ?? (input.type === "coding" ? 3 : 1), timeoutMs: input.timeoutMs ?? 30_000 };
}
