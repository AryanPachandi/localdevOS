import React from "react";

interface WorkspaceBarProps {
  userRoot: string;
  workspacePath: string;
  workspaceSource?: string;
  onChangeWorkspace: () => void;
}

export const WorkspaceBar: React.FC<WorkspaceBarProps> = ({
  userRoot,
  workspacePath,
  workspaceSource,
  onChangeWorkspace,
}) => {
  return (
    <div className="workspace-info">
      <span className="workspace-label">📂 Scope</span>
      <span className="workspace-path" title={userRoot}>{userRoot || "Loading..."}</span>
      <span className="workspace-label">Workspace</span>
      <span className="workspace-path" title={workspacePath}>
        {workspacePath || "No project selected"}{workspaceSource && workspacePath ? ` · ${workspaceSource}` : ""}
      </span>
      <button className="change-btn" onClick={onChangeWorkspace}>
        {workspacePath ? "Change" : "Select Workspace"}
      </button>
    </div>
  );
};
