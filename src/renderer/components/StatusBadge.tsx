import React from "react";
import type { ModelMode } from "../types";

interface StatusBadgeProps {
  status: "connected" | "starting" | "offline";
  selectedMode: ModelMode;
  onSelectMode: (mode: ModelMode) => void;
  routingInfo?: {
    model?: string;
    reason?: string;
  } | null;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  selectedMode,
  onSelectMode,
  routingInfo,
}) => {
  const getBadgeContent = () => {
    if (selectedMode === "gpt-oss") {
      return {
        text: "⚡ GPT-OSS 120B · Ollama Cloud",
        bg: "rgba(56, 189, 248, 0.15)",
        color: "#38bdf8",
        border: "rgba(56, 189, 248, 0.4)",
      };
    }
    if (selectedMode === "gemini") {
      return {
        text: "⚡ Gemini · Cloud",
        bg: "rgba(163, 113, 247, 0.15)",
        color: "#a371f7",
        border: "rgba(163, 113, 247, 0.4)",
      };
    }
    if (selectedMode === "llama" || selectedMode === "local") {
      return {
        text: "● Llama 3.2 · Local",
        bg: "rgba(63, 185, 80, 0.15)",
        color: "#3fb950",
        border: "rgba(63, 185, 80, 0.4)",
      };
    }

    // Auto Mode: Display routed model & concise reason if available
    if (routingInfo?.model) {
      const modelLabel =
        routingInfo.model === "gpt-oss"
          ? "GPT-OSS 120B"
          : routingInfo.model === "gemini"
          ? "Gemini"
          : "Llama 3.2";

      const color =
        routingInfo.model === "gpt-oss"
          ? "#38bdf8"
          : routingInfo.model === "gemini"
          ? "#a371f7"
          : "#3fb950";

      const bg =
        routingInfo.model === "gpt-oss"
          ? "rgba(56, 189, 248, 0.15)"
          : routingInfo.model === "gemini"
          ? "rgba(163, 113, 247, 0.15)"
          : "rgba(63, 185, 80, 0.15)";

      const border =
        routingInfo.model === "gpt-oss"
          ? "rgba(56, 189, 248, 0.4)"
          : routingInfo.model === "gemini"
          ? "rgba(163, 113, 247, 0.4)"
          : "rgba(63, 185, 80, 0.4)";

      return {
        text: `Auto → ${modelLabel}${routingInfo.reason ? ` (${routingInfo.reason})` : ""}`,
        bg,
        color,
        border,
      };
    }

    return {
      text: "Auto Router (Ready)",
      bg: "rgba(88, 166, 255, 0.15)",
      color: "#58a6ff",
      border: "rgba(88, 166, 255, 0.4)",
    };
  };

  const badge = getBadgeContent();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      {/* Model Selector Buttons */}
      <div
        style={{
          display: "flex",
          background: "#161b22",
          borderRadius: "6px",
          padding: "2px",
          border: "1px solid #30363d",
        }}
      >
        <button
          type="button"
          onClick={() => onSelectMode("auto")}
          style={{
            background: selectedMode === "auto" ? "#21262d" : "transparent",
            color: selectedMode === "auto" ? "#58a6ff" : "#8b949e",
            border: "none",
            borderRadius: "4px",
            padding: "4px 10px",
            fontSize: "12px",
            fontWeight: selectedMode === "auto" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          Auto
        </button>
        <button
          type="button"
          onClick={() => onSelectMode("llama")}
          style={{
            background: selectedMode === "llama" || selectedMode === "local" ? "#21262d" : "transparent",
            color: selectedMode === "llama" || selectedMode === "local" ? "#3fb950" : "#8b949e",
            border: "none",
            borderRadius: "4px",
            padding: "4px 10px",
            fontSize: "12px",
            fontWeight: selectedMode === "llama" || selectedMode === "local" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          Llama 3.2 · Local
        </button>
        <button
          type="button"
          onClick={() => onSelectMode("gemini")}
          style={{
            background: selectedMode === "gemini" ? "#21262d" : "transparent",
            color: selectedMode === "gemini" ? "#a371f7" : "#8b949e",
            border: "none",
            borderRadius: "4px",
            padding: "4px 10px",
            fontSize: "12px",
            fontWeight: selectedMode === "gemini" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          Gemini · Cloud
        </button>
        <button
          type="button"
          onClick={() => onSelectMode("gpt-oss")}
          style={{
            background: selectedMode === "gpt-oss" ? "#21262d" : "transparent",
            color: selectedMode === "gpt-oss" ? "#38bdf8" : "#8b949e",
            border: "none",
            borderRadius: "4px",
            padding: "4px 10px",
            fontSize: "12px",
            fontWeight: selectedMode === "gpt-oss" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          GPT-OSS 120B · Ollama Cloud
        </button>
      </div>

      {/* Model Active Status & Routing Reason Badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 10px",
          borderRadius: "12px",
          fontSize: "12px",
          fontWeight: 500,
          background: badge.bg,
          color: badge.color,
          border: `1px solid ${badge.border}`,
        }}
      >
        {badge.text}
      </div>
    </div>
  );
};
