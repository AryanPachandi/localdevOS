import React from "react";
import type { ToolActivityItem } from "../types";

interface ToolActivityProps {
  activities: ToolActivityItem[];
}

export const ToolActivity: React.FC<ToolActivityProps> = ({ activities }) => {
  if (!activities || activities.length === 0) return null;

  return (
    <div className="tool-activity-panel">
      {activities.map((act) => {
        const isDocker = act.name.startsWith("docker");
        const icon = isDocker ? "🐳" : "🔧";
        const argsSummary = Object.entries(act.args)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(" | ");

        return (
          <div key={act.id} className="tool-card">
            <div className="tool-card-header">
              <span>
                {icon} {act.name}
              </span>
              <span className={`tool-status ${act.status}`}>
                {act.status === "running" && "running..."}
                {act.status === "completed" && "✓ completed"}
                {act.status === "failed" && "⚠️ failed"}
              </span>
            </div>
            {argsSummary && <div className="tool-args">{argsSummary}</div>}
            {act.error && <div className="tool-args" style={{ color: "var(--danger)" }}>{act.error}</div>}
          </div>
        );
      })}
    </div>
  );
};
