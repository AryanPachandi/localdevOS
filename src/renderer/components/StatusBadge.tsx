import React from "react";
import type { ModelMode } from "../types";

interface StatusBadgeProps {
  status: "connected" | "starting" | "offline";
  selectedMode: ModelMode;
  onSelectMode: (mode: ModelMode) => void;
  isEscalated?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  selectedMode,
  onSelectMode,
  isEscalated,
}) => {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      {/* Model Mode Selector */}
      <div style={{ display: "flex", background: "#161b22", borderRadius: "6px", padding: "2px", border: "1px solid #30363d" }}>
        <button
          type="button"
          onClick={() => onSelectMode("auto")}
          style={{
            background: selectedMode === "auto" ? "#21262d" : "transparent",
            color: selectedMode === "auto" ? "#58a6ff" : "#8b949e",
            border: "none",
            borderRadius: "4px",
            padding: "4px 8px",
            fontSize: "12px",
            fontWeight: selectedMode === "auto" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          Auto
        </button>
        <button
          type="button"
          onClick={() => onSelectMode("local")}
          style={{
            background: selectedMode === "local" ? "#21262d" : "transparent",
            color: selectedMode === "local" ? "#3fb950" : "#8b949e",
            border: "none",
            borderRadius: "4px",
            padding: "4px 8px",
            fontSize: "12px",
            fontWeight: selectedMode === "local" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          Llama 3.2 (Local)
        </button>
        <button
          type="button"
          onClick={() => onSelectMode("gemini")}
          style={{
            background: selectedMode === "gemini" ? "#21262d" : "transparent",
            color: selectedMode === "gemini" ? "#a371f7" : "#8b949e",
            border: "none",
            borderRadius: "4px",
            padding: "4px 8px",
            fontSize: "12px",
            fontWeight: selectedMode === "gemini" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          Gemini 3.5 Flash
        </button>
      </div>

      {/* Privacy Indicator Badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 10px",
          borderRadius: "12px",
          fontSize: "12px",
          fontWeight: 500,
          background: isEscalated
            ? "rgba(210, 153, 34, 0.15)"
            : selectedMode === "gemini"
            ? "rgba(163, 113, 247, 0.15)"
            : "rgba(63, 185, 80, 0.15)",
          color: isEscalated
            ? "#d29922"
            : selectedMode === "gemini"
            ? "#a371f7"
            : "#3fb950",
          border: `1px solid ${
            isEscalated
              ? "rgba(210, 153, 34, 0.4)"
              : selectedMode === "gemini"
              ? "rgba(163, 113, 247, 0.4)"
              : "rgba(63, 185, 80, 0.4)"
          }`,
        }}
      >
        {isEscalated ? (
          <>⚡ Escalating to Gemini 3.5 Flash</>
        ) : selectedMode === "gemini" ? (
          <>☁ Gemini 3.5 Flash</>
        ) : (
          <>● Llama 3.2 • Local</>
        )}
      </div>
    </div>
  );
};
