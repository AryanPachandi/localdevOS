import React from "react";

interface WorkspaceBarProps {
  workspacePath: string;
  onChangeWorkspace: () => void;
}

export const WorkspaceBar: React.FC<WorkspaceBarProps> = ({
  workspacePath,
  onChangeWorkspace,
}) => {
  return (
    <div className="workspace-info">
      <span className="workspace-label">📂 Workspace</span>
      <span className="workspace-path" title={workspacePath}>
        {workspacePath || "Loading..."}
      </span>
      <button className="change-btn" onClick={onChangeWorkspace}>
        Change
      </button>
    </div>
  );
};
