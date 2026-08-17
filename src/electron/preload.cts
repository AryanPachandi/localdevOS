const { contextBridge, ipcRenderer } = require("electron");

console.log("[LocalDevOS] Preload script loading...");

const api = {
  getWorkspace: () => ipcRenderer.invoke("get-workspace"),
  selectWorkspace: () => ipcRenderer.invoke("select-workspace"),
  checkOllamaStatus: () => ipcRenderer.invoke("check-ollama-status"),
  sendMessage: (prompt: string, mode?: string) => ipcRenderer.invoke("send-message", prompt, mode),
  startVoiceInput: () => ipcRenderer.invoke("start-voice-input"),
  onToolActivity: (callback: (activity: any) => void) => {
    ipcRenderer.on("tool-activity", (_event: any, data: any) => callback(data));
  },
  onVoiceStatus: (callback: (status: "listening" | "transcribing" | "idle") => void) => {
    ipcRenderer.on("voice-status", (_event: any, data: any) => callback(data));
  },
  onApprovalRequest: (
    callback: (request: { id: string; command: string; reason: string }) => void
  ) => {
    ipcRenderer.on("approval-request", (_event: any, data: any) => callback(data));
  },
  respondApproval: (id: string, approved: boolean) =>
    ipcRenderer.invoke("respond-approval", { id, approved }),
};

console.log("[LocalDevOS] Exposing renderer API via contextBridge");
contextBridge.exposeInMainWorld("localDevOS", api);
console.log("[LocalDevOS] window.localDevOS successfully exposed!");
