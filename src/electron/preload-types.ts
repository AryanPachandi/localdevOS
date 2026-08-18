export type ModelMode = "auto" | "llama" | "gemini" | "gpt-oss" | "local";

export interface LocalDevOSApi {
  getWorkspace: () => Promise<{ root: string; name: string } | null>;
  getFilesystemScope: () => Promise<{ userRoot: string; applicationRoot: string; activeWorkspace: string | null; workspaceName: string | null; source: "manual" | "automatic" | "created" | "default" }>;
  getActiveWorkspace: () => Promise<{ root: string; name: string } | null>;
  selectWorkspace: () => Promise<{ root: string; name: string } | null>;
  checkOllamaStatus: () => Promise<{ status: "connected" | "starting" | "offline"; model: string }>;
  sendMessage: (prompt: string, mode?: ModelMode) => Promise<{ ok: boolean; response?: string; error?: string }>;
  startVoiceInput: () => Promise<{ ok: boolean; transcription?: string; error?: string }>;
  onToolActivity: (callback: (activity: any) => void) => void;
  onWorkspaceChanged: (callback: (scope: { userRoot: string; applicationRoot: string; activeWorkspace: string | null; workspaceName: string | null; source: string }) => void) => void;
  onVoiceStatus: (callback: (status: "listening" | "transcribing" | "idle") => void) => void;
  onApprovalRequest: (
    callback: (request: { id: string; command: string; reason: string }) => void
  ) => void;
  respondApproval: (id: string, approved: boolean) => Promise<void>;
}
