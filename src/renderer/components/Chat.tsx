import React, { useRef, useEffect } from "react";
import type { ChatMessage, ToolActivityItem } from "../types";
import { Message } from "./Message";
import { ToolActivity } from "./ToolActivity";

interface ChatProps {
  messages: ChatMessage[];
  activities: ToolActivityItem[];
  isThinking: boolean;
  onSelectShortcut: (prompt: string) => void;
}

export const Chat: React.FC<ChatProps> = ({
  messages,
  activities,
  isThinking,
  onSelectShortcut,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activities, isThinking]);

  if (messages.length === 0) {
    return (
      <div className="chat-container">
        <div className="welcome-container">
          <div className="welcome-title">LocalDevOS</div>
          <div className="welcome-subtitle">Your local AI developer agent.</div>

          <div className="welcome-grid">
            <div
              className="shortcut-card"
              onClick={() => onSelectShortcut("Debug my project for issues or errors")}
            >
              <div className="shortcut-title">🔍 Debug my project</div>
              <div className="shortcut-desc">Check configuration and test failures.</div>
            </div>

            <div
              className="shortcut-card"
              onClick={() => onSelectShortcut("Explore my files and project tree")}
            >
              <div className="shortcut-title">📂 Explore my files</div>
              <div className="shortcut-desc">Inspect project structure and layout.</div>
            </div>

            <div
              className="shortcut-card"
              onClick={() => onSelectShortcut("Show me my git status and recent changes")}
            >
              <div className="shortcut-title">Git Review</div>
              <div className="shortcut-desc">Inspect unstaged files and commit logs.</div>
            </div>

            <div
              className="shortcut-card"
              onClick={() => onSelectShortcut("Run Docker diagnostics or compose check")}
            >
              <div className="shortcut-title">🐳 Docker diagnostics</div>
              <div className="shortcut-desc">Check running containers and services.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      {messages.map((msg) => (
        <Message key={msg.id} message={msg} />
      ))}

      {activities.length > 0 && <ToolActivity activities={activities} />}

      {isThinking && (
        <div className="message-bubble assistant">
          <div className="message-header">LocalDevOS</div>
          <div className="message-content" style={{ color: "var(--text-muted)" }}>
            🤖 Thinking...
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
