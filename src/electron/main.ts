import electronPkg from "electron";
import type { BrowserWindow as BrowserWindowType } from "electron";
const { app, BrowserWindow, ipcMain, dialog } = electronPkg;
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import http from "node:http";
import type { Workspace } from "../workspace/workspace.js";
import { WorkspaceManager } from "../workspace/workspaceManager.js";
import { runAgent } from "../agent/agent.js";
import { speechToText } from "../speech/speechToText.js";
import type { ModelMode } from "../models/model.js";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindowType | null = null;
const workspaceManager = new WorkspaceManager();

const pendingApprovals = new Map<string, (approved: boolean) => void>();

function checkOllamaConnection(): Promise<{ status: "connected" | "offline"; model: string }> {
  return new Promise((resolve) => {
    const req = http.request("http://127.0.0.1:11434/api/tags", { method: "GET", timeout: 2000 }, (res) => {
      if (res.statusCode === 200) {
        resolve({ status: "connected", model: "llama3.2" });
      } else {
        resolve({ status: "offline", model: "llama3.2" });
      }
    });

    req.on("error", () => {
      resolve({ status: "offline", model: "llama3.2" });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ status: "offline", model: "llama3.2" });
    });

    req.end();
  });
}

function createWindow(): void {
  const preloadPath = path.join(__dirname, "preload.cjs");
  if (!fs.existsSync(preloadPath)) {
    console.error("❌ [Main] Preload script NOT found at:", preloadPath);
  } else {
    console.log("✅ [Main] Loading preload script from:", preloadPath);
  }

  mainWindow = new BrowserWindow({
    width: 1150,
    height: 780,
    minWidth: 850,
    minHeight: 600,
    backgroundColor: "#0b0d10",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0b0d10",
      symbolColor: "#8b949e",
      height: 38,
    },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    console.log("🔗 Loading Renderer from Dev Server URL:", devServerUrl);
    mainWindow.loadURL(devServerUrl);
  } else {
    const indexPath = path.join(__dirname, "../renderer/index.html");
    console.log("📄 Loading Renderer from index.html:", indexPath);
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// IPC Handlers
workspaceManager.onChange((scope) => mainWindow?.webContents.send("workspace-changed", scope));
ipcMain.handle("get-filesystem-scope", () => workspaceManager.getScope());
ipcMain.handle("get-active-workspace", () => workspaceManager.getActiveWorkspace());
// Kept temporarily for older renderers; it deliberately returns null on startup.
ipcMain.handle("get-workspace", () => workspaceManager.getActiveWorkspace());
ipcMain.handle("set-active-workspace", (_event, target: string) => workspaceManager.setActiveWorkspace(target, "manual"));

ipcMain.handle("select-workspace", async () => {
  if (!mainWindow) return workspaceManager.getActiveWorkspace();
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select Project Workspace",
  });

  if (!result.canceled && result.filePaths[0]) {
    try {
      const workspace = workspaceManager.setActiveWorkspace(result.filePaths[0], "manual");
      console.log("📂 IPC: Workspace updated to", workspace);
      return workspace;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid directory.";
      dialog.showErrorBox("Workspace Selection Error", message);
    }
  }
  return workspaceManager.getActiveWorkspace();
});

ipcMain.handle("resolve-workspace", (_event, prompt: string) => workspaceManager.resolve(prompt));

ipcMain.handle("check-ollama-status", async () => {
  return checkOllamaConnection();
});

ipcMain.handle("send-message", async (_event, prompt: string, mode?: ModelMode) => {
  if (!prompt || !prompt.trim()) {
    return { ok: false, error: "Prompt must not be empty." };
  }

  const modelMode: ModelMode = mode || "auto";
  const resolution = workspaceManager.resolve(prompt);
  if (resolution.kind === "ambiguous") return { ok: false, error: `${resolution.message}\n${resolution.candidates?.map((candidate, index) => `${index + 1}. ${candidate}`).join("\n")}` };
  if (resolution.kind !== "resolved" || !resolution.workspace) return { ok: false, error: resolution.message ?? "No active workspace is selected." };
  const taskWorkspace: Workspace = resolution.workspace;
  if (mainWindow) {
    mainWindow.webContents.send("tool-activity", {
      id: `workspace_resolution_${Date.now()}`,
      name: "workspace_resolver",
      args: { userRoot: workspaceManager.userRoot, source: resolution.source },
      status: "completed",
      result: `📁 Workspace Resolution\nScope: ${workspaceManager.userRoot}\nResolved workspace: ${taskWorkspace.root}${resolution.source === "created" ? `\n📁 Creating project directory\n✓ ${taskWorkspace.root}` : ""}`,
      timestamp: Date.now(),
    });
  }
  console.log(`💬 IPC: send-message [Mode: ${modelMode}] in workspace [${taskWorkspace.root}]: "${prompt}"`);

  try {
    const response = await runAgent(
      prompt,
      taskWorkspace,
      modelMode,
      (activity) => {
        if (mainWindow) {
          mainWindow.webContents.send("tool-activity", activity);
        }
      },
      (req) => {
        return new Promise<boolean>((resolve) => {
          const id = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          pendingApprovals.set(id, resolve);
          if (mainWindow) {
            console.log(`⚠️ Requesting Human Approval for [${req.command}]`);
            mainWindow.webContents.send("approval-request", {
              id,
              command: req.command,
              reason: req.reason,
            });
          } else {
            resolve(false);
          }
        });
      }
    );
    return { ok: true, response };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent execution failed.";
    console.error("⚠️ IPC Error running agent:", error);
    return { ok: false, error: message };
  }
});

ipcMain.handle("start-voice-input", async () => {
  if (!mainWindow) return { ok: false, error: "Window unavailable." };

  try {
    mainWindow.webContents.send("voice-status", "listening");
    const transcription = await speechToText();
    mainWindow.webContents.send("voice-status", "idle");
    return { ok: true, transcription };
  } catch (error) {
    mainWindow.webContents.send("voice-status", "idle");
    const message = error instanceof Error ? error.message : "Voice recognition failed.";
    return { ok: false, error: message };
  }
});

ipcMain.handle("respond-approval", (_event, { id, approved }: { id: string; approved: boolean }) => {
  const resolver = pendingApprovals.get(id);
  if (resolver) {
    console.log(`👤 Human Approval response for ${id}: ${approved ? "APPROVED" : "DENIED"}`);
    resolver(approved);
    pendingApprovals.delete(id);
  }
});
