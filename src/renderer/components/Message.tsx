import React from "react";
import type { ChatMessage } from "../types";

interface MessageProps {
  message: ChatMessage;
}

function renderFormattedContent(content: string): React.ReactNode {
  // Regex to match Markdown links [text](url) and raw URLs http(s)://...
  const parts: React.ReactNode[] = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.substring(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      // Markdown link [text](url)
      parts.push(
        <a
          key={`link_${match.index}`}
          href={match[2]}
          target="_blank"
          rel="noreferrer"
          className="clickable-link"
          style={{ color: "#58a6ff", textDecoration: "underline", wordBreak: "break-all" }}
        >
          {match[1]}
        </a>
      );
    } else if (match[3]) {
      // Raw URL
      const url = match[3];
      parts.push(
        <a
          key={`raw_${match.index}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="clickable-link"
          style={{ color: "#58a6ff", textDecoration: "underline", wordBreak: "break-all" }}
        >
          {url}
        </a>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex));
  }

  return parts;
}

export const Message: React.FC<MessageProps> = ({ message }) => {
  const isUser = message.role === "user";

  return (
    <div className={`message-bubble ${isUser ? "user" : "assistant"}`}>
      <div className="message-header">
        <span>{isUser ? "You" : "LocalDevOS"}</span>
      </div>
      <div className="message-content" style={{ whiteSpace: "pre-wrap" }}>
        {renderFormattedContent(message.content)}
      </div>
    </div>
  );
};
