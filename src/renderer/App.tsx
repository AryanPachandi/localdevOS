import React, { useState, useEffect } from "react";
import type { ChatMessage, ToolActivityItem, ApprovalRequest, ModelMode } from "./types";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceBar } from "./components/WorkspaceBar";
import { StatusBadge } from "./components/StatusBadge";
import { Chat } from "./components/Chat";
import { InputBar } from "./components/InputBar";
import { ApprovalModal } from "./components/ApprovalModal";

export const App: React.FC = () => {
  const [workspace, setWorkspace] = useState<{ root: string; name: string }>({
    root: "",
    name: "",
  });
  const [ollamaStatus, setOllamaStatus] = useState<"connected" | "starting" | "offline">("connected");
  const [modelMode, setModelMode] = useState<ModelMode>("auto");
  const [routingInfo, setRoutingInfo] = useState<{ model?: string; reason?: string } | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activities, setActivities] = useState<ToolActivityItem[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<"listening" | "transcribing" | "idle">("idle");
  const [externalVoiceText, setExternalVoiceText] = useState("");
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null);

  const [recentChats] = useState<string[]>([
    "Debug project configuration",
    "Git status & diff review",
  ]);
  const [activeChatIndex, setActiveChatIndex] = useState<number>(0);

  // Initialize workspace & status
  useEffect(() => {
    if (window.localDevOS) {
      window.localDevOS.getWorkspace().then((ws) => {
        if (ws) setWorkspace(ws);
      });

      window.localDevOS.checkOllamaStatus().then((res) => {
        setOllamaStatus(res.status);
      });

      // Event Listeners
      window.localDevOS.onToolActivity((activity: ToolActivityItem) => {
        if (activity.name === "model_router") {
          const model = (activity.args?.model as string) || (activity.args?.fallbackModel as string);
          const resultStr = String(activity.result || "");
          let reason = "";

          if (resultStr.includes("Reason: ")) {
            reason = resultStr.split("Reason: ")[1].replace(")", "").trim();
          }

          setRoutingInfo({ model, reason });
        } else if (activity.name === "planner" && activity.args?.model) {
          const model = activity.args.model as string;
          const resultStr = String(activity.result || "");
          setRoutingInfo({ model, reason: resultStr });
        }

        setActivities((prev) => {
          const index = prev.findIndex((a) => a.id === activity.id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = activity;
            return updated;
          }
          return [...prev, activity];
        });
      });

      window.localDevOS.onVoiceStatus((status) => {
        setVoiceStatus(status);
      });

      window.localDevOS.onApprovalRequest((req) => {
        setApprovalRequest(req);
      });
    }
  }, []);

  const handleChangeWorkspace = async () => {
    if (window.localDevOS) {
      const updated = await window.localDevOS.selectWorkspace();
      if (updated) {
        setWorkspace(updated);
      }
    }
  };

  const handleSendMessage = async (prompt: string) => {
    if (!prompt.trim()) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);
    setActivities([]);

    try {
      const result = await window.localDevOS.sendMessage(prompt, modelMode);
      if (result.ok && result.response) {
        const assistantMsg: ChatMessage = {
          id: `assistant_${Date.now()}`,
          role: "assistant",
          content: result.response,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: `err_${Date.now()}`,
          role: "assistant",
          content: `⚠️ Error: ${result.error || "Execution failed."}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: "assistant",
        content: `⚠️ Connection Error: ${err instanceof Error ? err.message : "Failed to reach agent."}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleStartVoice = async () => {
    if (!window.localDevOS) return;
    try {
      const res = await window.localDevOS.startVoiceInput();
      if (res.ok && res.transcription) {
        setExternalVoiceText(res.transcription);
      } else if (res.error) {
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_${Date.now()}`,
            role: "assistant",
            content: `⚠️ Speech recognition failed: ${res.error}`,
            timestamp: Date.now(),
          },
        ]);
      }
    } catch (error) {
      console.error("Voice input error:", error);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setActivities([]);
    setRoutingInfo(null);
  };

  const handleRespondApproval = async (id: string, approved: boolean) => {
    if (window.localDevOS) {
      await window.localDevOS.respondApproval(id, approved);
    }
    setApprovalRequest(null);
  };

  return (
    <div className="app-container">
      <Sidebar
        onNewChat={handleNewChat}
        recentChats={recentChats}
        activeChatIndex={activeChatIndex}
        onSelectChat={(idx) => setActiveChatIndex(idx)}
      />

      <main className="main-content">
        <header className="top-header">
          <WorkspaceBar
            workspacePath={workspace.root}
            onChangeWorkspace={handleChangeWorkspace}
          />
          <StatusBadge
            status={ollamaStatus}
            selectedMode={modelMode}
            onSelectMode={setModelMode}
            routingInfo={routingInfo}
          />
        </header>

        <Chat
          messages={messages}
          activities={activities}
          isThinking={isThinking}
          onSelectShortcut={handleSendMessage}
        />

        <InputBar
          onSendMessage={handleSendMessage}
          onStartVoice={handleStartVoice}
          voiceStatus={voiceStatus}
          disabled={isThinking}
          externalText={externalVoiceText}
          onClearExternalText={() => setExternalVoiceText("")}
        />
      </main>

      <ApprovalModal
        request={approvalRequest}
        onRespond={handleRespondApproval}
      />
    </div>
  );
};

export default App;
