import { GoogleGenAI } from "@google/genai";
import type { Message, Tool } from "ollama";
import { executeTool, type ApprovalHandler } from "../agent/executor.js";
import type { ModelClient, OnToolActivityCallback, ToolActivityEvent } from "./model.js";
import type { Workspace } from "../workspace/workspace.js";
import "dotenv/config";

const MAX_TOOL_ROUNDS = 8;

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

function convertToolsToGemini(tools: Tool[]) {
  return tools.map((t) => {
    const params = t.function.parameters;
    const item: {
      name: string;
      description: string;
      parameters: {
        type: string;
        properties: Record<string, unknown>;
        required?: string[];
      };
    } = {
      name: t.function.name || "",
      description: t.function.description || "",
      parameters: {
        type: "OBJECT",
        properties: (params?.properties as Record<string, unknown>) || {},
      },
    };

    if (params?.required && params.required.length > 0) {
      item.parameters.required = params.required;
    }

    return item;
  });
}

export async function chat(
  messages: Message[],
  tools: Tool[],
  workspace: Workspace,
  onToolActivity?: OnToolActivityCallback,
  onApprovalRequest?: ApprovalHandler
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    console.warn("⚠️ Gemini API key missing (GEMINI_API_KEY is not set).");
    return "Gemini is not configured.\n\nPlease add GEMINI_API_KEY to your .env file to enable Gemini 3.5 Flash.";
  }

  const modelName = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  console.log(`☁ Gemini 3.5 Flash [${modelName}] is thinking...`);

  const ai = new GoogleGenAI({ apiKey });
  const geminiTools = convertToolsToGemini(tools);

  // Format messages into Gemini contents format
  const contents: any[] = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : m.role === "system" ? "user" : m.role,
    parts: [{ text: redactSecrets(m.content) }],
  }));

  const maxIterations = parseInt(process.env.MAX_AGENT_ITERATIONS || "8", 10);
  for (let round = 0; round < maxIterations; round += 1) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          tools: [{ functionDeclarations: geminiTools as any }],
        },
      });

      const functionCalls = response.functionCalls || (response as any).candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

      if (!functionCalls || functionCalls.length === 0) {
        return response.text || "No response received from Gemini.";
      }

      // Add assistant response to history
      contents.push({
        role: "model",
        parts: (response as any).candidates?.[0]?.content?.parts || [{ text: response.text || "" }],
      });

      const functionResponsesParts: any[] = [];

      for (const call of functionCalls) {
        const callName = call.name;
        const callArgs = (call.args as Record<string, unknown>) || {};
        const callId = `call_gemini_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        console.log(`☁ Gemini Tool: ${callName}`);
        const activityEvent: ToolActivityEvent = {
          id: callId,
          name: callName,
          args: callArgs,
          status: "running",
          timestamp: Date.now(),
        };

        if (onToolActivity) {
          onToolActivity(activityEvent);
        }

        let result: unknown;
        try {
          result = await executeTool(callName, callArgs, workspace, onApprovalRequest);
          console.log("✅ Gemini tool completed");
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
          console.log("⚠️ Gemini tool failed");
          if (onToolActivity) {
            onToolActivity({
              ...activityEvent,
              status: "failed",
              error: message,
              result,
            });
          }
        }

        functionResponsesParts.push({
          functionResponse: {
            name: callName,
            response: { output: redactSecrets(JSON.stringify(result)) },
          },
        });
      }

      contents.push({
        role: "user",
        parts: functionResponsesParts,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gemini API error occurred.";
      console.error("⚠️ Gemini error:", message);
      return `⚠️ Gemini Error: ${message}`;
    }
  }

  return "Gemini execution reached maximum tool rounds limit.";
}

export const geminiModel: ModelClient = {
  name: "Gemini 3.5 Flash",
  provider: "gemini",
  chat,
};
