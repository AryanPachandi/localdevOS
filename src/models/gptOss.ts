import ollama from "ollama";
import type { Message, Tool } from "ollama";
import { executeTool, type ApprovalHandler } from "../agent/executor.js";
import type { ModelClient, OnToolActivityCallback, ToolActivityEvent } from "./model.js";
import type { Workspace } from "../workspace/workspace.js";
import "dotenv/config";

const SECRET_PATTERNS = [
  /AIzaSy[A-Za-z0-9_-]{33}/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /sk-[A-Za-z0-9]{32,}/g,
  /-----BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY-----[\s\S]*?-----END \1 KEY-----/g,
];

function redactSecrets(text: string): string {
  if (!text) return text;
  let clean = text;
  for (const pattern of SECRET_PATTERNS) {
    clean = clean.replace(pattern, "[REDACTED_SECRET]");
  }
  return clean;
}

export async function chat(
  messages: Message[],
  tools: Tool[],
  workspace: Workspace,
  onToolActivity?: OnToolActivityCallback,
  onApprovalRequest?: ApprovalHandler
): Promise<string> {
  const modelName = process.env.OLLAMA_CLOUD_MODEL || "gpt-oss:120b-cloud";
  const maxIterations = parseInt(process.env.MAX_AGENT_ITERATIONS || "8", 10);
  console.log(`⚡ GPT-OSS 120B Cloud [${modelName}] is thinking...`);

  // Apply secret redaction to initial messages
  const conversation: Message[] = messages.map((m) => ({
    ...m,
    content: redactSecrets(m.content),
  }));

  try {
    let response = await ollama.chat({
      model: modelName,
      messages: conversation,
      tools,
    });

    for (let round = 0; response.message.tool_calls?.length; round += 1) {
      if (round >= maxIterations) {
        console.warn("⚠️ GPT-OSS reached MAX_AGENT_ITERATIONS limit.");
        throw new Error(`GPT-OSS reached maximum iteration limit (${maxIterations}); task is incomplete.`);
      }

      conversation.push(response.message);

      for (const call of response.message.tool_calls) {
        const callId = `call_gptoss_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        console.log(`⚡ GPT-OSS Tool: ${call.function.name}`);

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
          console.log("✅ GPT-OSS tool completed");
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
          console.log("⚠️ GPT-OSS tool failed");
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
          content: redactSecrets(JSON.stringify(result)),
        });
      }

      console.log("⚡ GPT-OSS generating response...");
      response = await ollama.chat({
        model: modelName,
        messages: conversation,
        tools,
      });
    }

    return response.message.content;
  } catch (error) {
    const message = error instanceof Error ? error.message : "GPT-OSS model error occurred.";
    console.error("⚠️ GPT-OSS 120B Cloud Error:", message);
    throw new Error(`GPT-OSS Cloud Error: ${message}. Make sure you are signed in to Ollama and that cloud models are enabled.`);
  }
}

export const gptOssModel: ModelClient = {
  name: "GPT-OSS 120B Cloud",
  provider: "gpt-oss",
  chat,
};
