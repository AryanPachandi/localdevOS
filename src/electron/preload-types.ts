export type ModelMode = "auto" | "llama" | "gemini" | "gpt-oss" | "local";

export interface LocalDevOSApi {
  getWorkspace: () => Promise<{ root: string; name: string }>;
  selectWorkspace: () => Promise<{ root: string; name: string } | null>;
  checkOllamaStatus: () => Promise<{ status: "connected" | "starting" | "offline"; model: string }>;
  sendMessage: (prompt: string, mode?: ModelMode) => Promise<{ ok: boolean; response?: string; error?: string }>;
  startVoiceInput: () => Promise<{ ok: boolean; transcription?: string; error?: string }>;
  onToolActivity: (callback: (activity: any) => void) => void;
  onVoiceStatus: (callback: (status: "listening" | "transcribing" | "idle") => void) => void;
  onApprovalRequest: (
    callback: (request: { id: string; command: string; reason: string }) => void
  ) => void;
  respondApproval: (id: string, approved: boolean) => Promise<void>;
}
