export interface TaskTelemetryRecord {
  taskType: string;
  executionMode: "tool_first" | "agent";
  selectedModel: string | null;
  workspace: string;
  toolCalls: string[];
  iterations: number;
  durationMs: number;
  success: boolean;
}

export async function recordTaskTelemetry(record: TaskTelemetryRecord): Promise<void> {
  try {
    const opikModule = await import("opik");
    const opikApi = (opikModule as { default?: unknown; Opik?: unknown }).default ?? opikModule;

    if (typeof opikApi === "object" && opikApi && "track" in opikApi) {
      const tracker = (opikApi as { track?: (payload: Record<string, unknown>) => unknown }).track;
      if (typeof tracker === "function") {
        tracker({
          taskType: record.taskType,
          executionMode: record.executionMode,
          selectedModel: record.selectedModel,
          workspace: record.workspace,
          toolCalls: record.toolCalls,
          iterations: record.iterations,
          durationMs: record.durationMs,
          success: record.success,
        });
      }
    }
  } catch {
    // Opik is optional; silently ignore when not configured.
  }
}
