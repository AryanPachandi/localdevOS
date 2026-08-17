import React from "react";

interface SidebarProps {
  onNewChat: () => void;
  recentChats: string[];
  activeChatIndex: number;
  onSelectChat: (index: number) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onNewChat,
  recentChats,
  activeChatIndex,
  onSelectChat,
}) => {
  return (
    <aside className="sidebar">
      <div className="brand-header">
        <span>🐝</span> LocalDevOS
      </div>

      <button className="new-chat-btn" onClick={onNewChat}>
        <span>+</span> New Chat
      </button>

      <div className="recent-chats-label">Recent</div>
      <div className="recent-list">
        {recentChats.map((chatTitle, idx) => (
          <div
            key={idx}
            className={`recent-item ${idx === activeChatIndex ? "active" : ""}`}
            onClick={() => onSelectChat(idx)}
          >
            <span>💬</span> {chatTitle}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <span>⚙</span> Settings
      </div>
    </aside>
  );
};
