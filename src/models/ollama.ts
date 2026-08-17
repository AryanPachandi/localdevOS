import ollama from "ollama";
import type { Message, Tool } from "ollama";
import { executeTool, type ApprovalHandler } from "../agent/executor.js";
import type { ModelClient, OnToolActivityCallback, ToolActivityEvent } from "./model.js";
import type { Workspace } from "../workspace/workspace.js";

const getMaxIterations = () => parseInt(process.env.MAX_AGENT_ITERATIONS || "8", 10);

export async function chat(
  messages: Message[],
  tools: Tool[],
  workspace: Workspace,
  onToolActivity?: OnToolActivityCallback,
  onApprovalRequest?: ApprovalHandler
): Promise<string> {
  const maxIterations = getMaxIterations();
  const conversation = [...messages];
  console.log("🤖 Llama 3.2 is thinking...");
  let response = await ollama.chat({
    model: "llama3.2",
    messages: conversation,
    tools,
  });

  for (let round = 0; response.message.tool_calls?.length; round += 1) {
    if (round >= maxIterations) {
      return "I stopped because the model requested too many consecutive tool calls.";
    }
    conversation.push(response.message);

    for (const call of response.message.tool_calls) {
      const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      console.log(`🔧 Tool: ${call.function.name}`);
      const requestedPath = call.function.arguments.directory ?? call.function.arguments.filePath;
      if (typeof requestedPath === "string") console.log(`📂 Path: ${requestedPath}`);

      const activityEvent: ToolActivityEvent = {
        id: callId,
        name: call.function.name,
        args: (call.function.arguments as Record<string, unknown>) || {},
        status: "running",
        timestamp: Date.now(),
      };

      if (onToolActivity) {
        onToolActivity(activityEvent);
      }

      let result: unknown;
      try {
        result = await executeTool(call.function.name, call.function.arguments, workspace, onApprovalRequest);
        console.log("✅ Tool completed");
        if (onToolActivity) {
          onToolActivity({
            ...activityEvent,
            status: "completed",
            result,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected tool execution error.";
        result = { ok: false, error: { message, code: "TOOL_EXECUTION_FAILED" } };
        console.log("⚠️ Tool failed");
        if (onToolActivity) {
          onToolActivity({
            ...activityEvent,
            status: "failed",
            error: message,
            result,
          });
        }
      }

      conversation.push({
        role: "tool",
        tool_name: call.function.name,
        content: JSON.stringify(result),
      });
    }

    console.log("🤖 Generating response...");
    response = await ollama.chat({
      model: "llama3.2",
      messages: conversation,
      tools,
    });
  }

  return response.message.content;
}

export const ollamaModel: ModelClient = {
  name: "Llama 3.2",
  provider: "llama",
  chat,
};
