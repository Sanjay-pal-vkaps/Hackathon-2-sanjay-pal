"use client";

import React, { useState, useCallback } from "react";
import { useConversation, ConversationProvider } from "@elevenlabs/react";

export type VoiceState =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "speaking"
  | "pending_confirmation"
  | "error";

export interface VoiceAssistantProps {
  onProposalCreated?: (proposal: any) => void;
}

function VoiceAssistantInner({ onProposalCreated }: VoiceAssistantProps) {
  const [activeProposal, setActiveProposal] = useState<{ id: string; title: string } | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("Ready to start voice conversation");

  const conversation = useConversation({
    onConnect: () => {
      setStatusMessage("Connected! Speak to your assistant (e.g. 'What are my meetings today?')");
      setErrorDetail(null);
    },
    onDisconnect: () => {
      setStatusMessage("Voice session ended");
    },
    onMessage: (message) => {
      console.log("ElevenLabs transcript/event:", message);
    },
    onError: (err) => {
      console.error("ElevenLabs conversation error:", err);
      setErrorDetail(typeof err === "string" ? err : (err as any)?.message || "Voice conversation error");
      setStatusMessage("Voice error occurred");
    },
  });

  const voiceState: VoiceState =
    errorDetail
      ? "error"
      : activeProposal
      ? "pending_confirmation"
      : conversation.status === "connecting"
      ? "connecting"
      : conversation.isSpeaking
      ? "speaking"
      : conversation.status === "connected"
      ? "listening"
      : "idle";

  const startVoiceSession = useCallback(async () => {
    try {
      setStatusMessage("Connecting to ElevenLabs Conversational AI...");
      setErrorDetail(null);

      // Check microphone permission
      if (typeof navigator !== "undefined" && navigator.mediaDevices) {
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          setErrorDetail("Microphone access denied. Please allow microphone permissions in your browser.");
          setStatusMessage("Microphone permission required");
          return;
        }
      }

      // 1. Fetch signed session URL from backend
      const res = await fetch("/api/voice/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer user-session-token",
        },
      });

      const data = await res.json();
      if (!data.success || !data.signedUrl) {
        throw new Error(data.error || "Failed to acquire signed session URL");
      }

      // 2. Start bidirectional audio stream with ElevenLabs
      await conversation.startSession({
        signedUrl: data.signedUrl,
      });
    } catch (err: any) {
      setErrorDetail(err.message || "Unable to initialize voice assistant");
      setStatusMessage("Voice connection failed");
    }
  }, [conversation]);

  const endVoiceSession = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch (err) {
      console.error("Error ending session:", err);
    }
    setActiveProposal(null);
    setStatusMessage("Voice session ended");
  }, [conversation]);

  const simulateTaskProposal = async () => {
    // Demo/Mock tool invocation for testing approval gating in UI
    setStatusMessage("Proposing task via voice...");

    try {
      const res = await fetch("/api/voice/tools", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer user-session-token",
        },
        body: JSON.stringify({
          tool_name: "propose_trello_task",
          parameters: {
            title: "Review Q3 Financial Reports",
            description: "Audited statement review requested by client in Slack",
            dueDate: "2026-11-05",
          },
        }),
      });

      const data = await res.json();
      if (data.success && data.action_required === "telegram_confirmation") {
        setActiveProposal({
          id: data.result?.proposalId || "prop-voice-1",
          title: "Review Q3 Financial Reports",
        });
        if (onProposalCreated) {
          onProposalCreated(data.result);
        }
        setStatusMessage(data.spoken_response || "Proposal created! Awaiting Telegram confirmation.");
      }
    } catch (err: any) {
      setErrorDetail(err.message || "Failed to propose task");
    }
  };

  return (
    <div
      style={{
        background: "rgba(17, 24, 39, 0.85)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderRadius: "16px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        padding: "24px",
        color: "#F9FAFB",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
        maxWidth: "600px",
        margin: "24px auto",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
            🎙️ ElevenLabs Conversational Voice
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "0.875rem", color: "#9CA3AF" }}>
            Real-time audio assistant with confirmation-gated Trello writes
          </p>
        </div>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "4px 10px",
            borderRadius: "9999px",
            background:
              voiceState === "listening"
                ? "rgba(16, 185, 129, 0.2)"
                : voiceState === "pending_confirmation"
                ? "rgba(245, 158, 11, 0.2)"
                : voiceState === "error"
                ? "rgba(239, 68, 68, 0.2)"
                : "rgba(156, 163, 175, 0.2)",
            color:
              voiceState === "listening"
                ? "#34D399"
                : voiceState === "pending_confirmation"
                ? "#FBBF24"
                : voiceState === "error"
                ? "#F87171"
                : "#D1D5DB",
            border:
              voiceState === "listening"
                ? "1px solid rgba(16, 185, 129, 0.4)"
                : voiceState === "pending_confirmation"
                ? "1px solid rgba(245, 158, 11, 0.4)"
                : voiceState === "error"
                ? "1px solid rgba(239, 68, 68, 0.4)"
                : "1px solid rgba(156, 163, 175, 0.3)",
          }}
        >
          {voiceState.replace("_", " ")}
        </span>
      </div>

      {/* Visualizer & Status Message */}
      <div
        style={{
          background: "rgba(0, 0, 0, 0.3)",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "20px",
          border: "1px solid rgba(255, 255, 255, 0.05)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <div
          style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            background:
              voiceState === "listening" ? "#10B981" : voiceState === "connecting" ? "#F59E0B" : "#6B7280",
            boxShadow: voiceState === "listening" ? "0 0 12px #10B981" : "none",
            animation: voiceState === "listening" ? "pulse 1.5s infinite" : "none",
          }}
        />
        <div style={{ flex: 1, fontSize: "0.925rem" }}>{statusMessage}</div>
      </div>

      {/* Confirmation Gate Notice */}
      {voiceState === "pending_confirmation" && activeProposal && (
        <div
          style={{
            background: "rgba(245, 158, 11, 0.15)",
            border: "1px solid rgba(245, 158, 11, 0.4)",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "20px",
          }}
        >
          <div style={{ fontWeight: 600, color: "#FBBF24", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span>⚠️</span> Confirmation Gate Active (Zero Unconfirmed Writes)
          </div>
          <div style={{ fontSize: "0.875rem", color: "#F3F4F6", lineHeight: 1.5 }}>
            Task <strong>"{activeProposal.title}"</strong> proposal is waiting for explicit approval.
            Please open Telegram and tap <strong>[✅ Approve & Create Card]</strong> to execute the Trello write.
          </div>
        </div>
      )}

      {/* Error Details */}
      {errorDetail && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            borderRadius: "12px",
            padding: "12px 16px",
            marginBottom: "20px",
            fontSize: "0.875rem",
            color: "#FCA5A5",
          }}
        >
          <strong>Error:</strong> {errorDetail}
        </div>
      )}

      {/* Action Controls */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {voiceState === "idle" || voiceState === "error" ? (
          <button
            onClick={startVoiceSession}
            style={{
              flex: 1,
              background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
              color: "white",
              padding: "12px 20px",
              borderRadius: "10px",
              border: "none",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: "pointer",
              boxShadow: "0 4px 14px 0 rgba(79, 70, 229, 0.4)",
              transition: "all 0.2s ease",
            }}
          >
            Start Voice Conversation
          </button>
        ) : (
          <button
            onClick={endVoiceSession}
            style={{
              flex: 1,
              background: "rgba(239, 68, 68, 0.8)",
              color: "white",
              padding: "12px 20px",
              borderRadius: "10px",
              border: "none",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            End Conversation
          </button>
        )}

        <button
          onClick={simulateTaskProposal}
          style={{
            background: "rgba(255, 255, 255, 0.08)",
            color: "#E5E7EB",
            padding: "12px 16px",
            borderRadius: "10px",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            fontWeight: 500,
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          Test Voice Proposal Gate
        </button>
      </div>
    </div>
  );
}

export function VoiceAssistant(props: VoiceAssistantProps) {
  return (
    <ConversationProvider>
      <VoiceAssistantInner {...props} />
    </ConversationProvider>
  );
}
