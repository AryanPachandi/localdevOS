import React from "react";

interface VoiceButtonProps {
  voiceStatus: "listening" | "transcribing" | "idle";
  onStartVoice: () => void;
  disabled?: boolean;
}

export const VoiceButton: React.FC<VoiceButtonProps> = ({
  voiceStatus,
  onStartVoice,
  disabled,
}) => {
  const isRecording = voiceStatus === "listening" || voiceStatus === "transcribing";

  return (
    <button
      type="button"
      className={`voice-btn ${isRecording ? "active" : ""}`}
      onClick={onStartVoice}
      disabled={disabled || isRecording}
      title={
        voiceStatus === "listening"
          ? "🎙️ Listening..."
          : voiceStatus === "transcribing"
          ? "📝 Transcribing..."
          : "Click to speak"
      }
    >
      🎤
    </button>
  );
};
