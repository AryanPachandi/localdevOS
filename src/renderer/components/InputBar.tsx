import React, { useState, useRef, useEffect } from "react";
import { VoiceButton } from "./VoiceButton";

interface InputBarProps {
  onSendMessage: (text: string) => void;
  onStartVoice: () => void;
  voiceStatus: "listening" | "transcribing" | "idle";
  disabled?: boolean;
  externalText?: string;
  onClearExternalText?: () => void;
}

export const InputBar: React.FC<InputBarProps> = ({
  onSendMessage,
  onStartVoice,
  voiceStatus,
  disabled,
  externalText,
  onClearExternalText,
}) => {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (externalText) {
      setText((prev) => (prev ? `${prev} ${externalText}` : externalText));
      if (onClearExternalText) onClearExternalText();
    }
  }, [externalText, onClearExternalText]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    onSendMessage(text.trim());
    setText("");
  };

  return (
    <div className="input-container">
      {voiceStatus !== "idle" && (
        <div className="voice-status-bar">
          {voiceStatus === "listening" && "🎙️ Listening to microphone clip..."}
          {voiceStatus === "transcribing" && "📝 Transcribing with local Whisper..."}
        </div>
      )}
      <div className="input-box-wrapper">
        <VoiceButton
          voiceStatus={voiceStatus}
          onStartVoice={onStartVoice}
          disabled={disabled}
        />
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          rows={1}
          placeholder="Ask LocalDevOS..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <button
          type="button"
          className="send-btn"
          onClick={handleSubmit}
          disabled={!text.trim() || disabled}
        >
          Send
        </button>
      </div>
    </div>
  );
};
