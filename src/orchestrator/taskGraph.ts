import type { TaskPlan, TaskState } from "./types.js";

export class TaskGraph {
  readonly byId = new Map<string, TaskState>();
  constructor(readonly plan: TaskPlan) {
    for (const task of plan.tasks) {
      if (this.byId.has(task.id)) throw new Error(`Duplicate task id: ${task.id}`);
      this.byId.set(task.id, task);
    }
    for (const task of plan.tasks) for (const dep of task.dependencies) {
      if (!this.byId.has(dep)) throw new Error(`Task ${task.id} depends on missing task ${dep}`);
    }
  }
  ready(): TaskState[] {
    return this.plan.tasks.filter((task) => task.status === "pending" && task.dependencies.every((id) => this.byId.get(id)?.status === "completed"));
  }
  blockDependents(failedId: string): TaskState[] {
    const blocked: TaskState[] = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const task of this.plan.tasks) {
        if (task.status !== "pending" && task.status !== "ready") continue;
        if (task.dependencies.some((id) => id === failedId || this.byId.get(id)?.status === "failed" || this.byId.get(id)?.status === "blocked" || this.byId.get(id)?.status === "cancelled")) {
          task.status = "blocked"; blocked.push(task); changed = true;
        }
      }
    }
    return blocked;
  }
}
