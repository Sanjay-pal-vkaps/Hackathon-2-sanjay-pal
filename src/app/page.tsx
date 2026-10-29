import React from "react";
import { VoiceAssistant } from "@/components/voice-assistant";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at top, #1E1B4B 0%, #0F172A 100%)",
        color: "#F8FAFC",
        padding: "3rem 1.5rem",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        {/* Header */}
        <header style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <div
            style={{
              display: "inline-block",
              background: "rgba(99, 102, 241, 0.15)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              color: "#A5B4FC",
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "4px 12px",
              borderRadius: "9999px",
              marginBottom: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Milestone 7: Voice AI Extension Active
          </div>
          <h1
            style={{
              fontSize: "2.5rem",
              fontWeight: 800,
              margin: "0 0 12px",
              background: "linear-gradient(to right, #FFFFFF, #CBD5E1)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Multi-App Personal AI Assistant
          </h1>
          <p style={{ color: "#94A3B8", fontSize: "1.05rem", margin: 0 }}>
            Unified intelligence across Gmail, Google Calendar, Slack, Trello, and Telegram.
          </p>
        </header>

        {/* Integration Badges */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: "12px",
            marginBottom: "2rem",
          }}
        >
          {[
            { name: "Gmail", status: "Read-Only", icon: "📧" },
            { name: "Calendar", status: "Read-Only", icon: "🗓️" },
            { name: "Slack", status: "Read-Only", icon: "💬" },
            { name: "Trello", status: "Gated Writes", icon: "📋" },
            { name: "Telegram", status: "Approval Gate", icon: "🤖" },
          ].map((app) => (
            <div
              key={app.name}
              style={{
                background: "rgba(30, 41, 59, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "12px",
                padding: "12px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "1.5rem", marginBottom: "4px" }}>{app.icon}</div>
              <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{app.name}</div>
              <div style={{ fontSize: "0.75rem", color: "#94A3B8" }}>{app.status}</div>
            </div>
          ))}
        </div>

        {/* ElevenLabs Voice Assistant Section */}
        <VoiceAssistant />

        {/* Security & Parity Details */}
        <section
          style={{
            marginTop: "2.5rem",
            background: "rgba(15, 23, 42, 0.5)",
            borderRadius: "12px",
            border: "1px solid rgba(255, 255, 255, 0.05)",
            padding: "20px",
            fontSize: "0.875rem",
            color: "#94A3B8",
            lineHeight: 1.6,
          }}
        >
          <h3 style={{ color: "#E2E8F0", margin: "0 0 8px", fontSize: "1rem" }}>
            🛡️ Confirmation-Gate Parity Architecture
          </h3>
          <p style={{ margin: "0 0 8px" }}>
            ElevenLabs Conversational AI operates under the identical security policies as the text assistant.
            Direct writes to Trello are rejected at the centralized MCP Gateway level.
          </p>
          <ul style={{ margin: 0, paddingLeft: "20px" }}>
            <li>Voice tool calls execute with <code>callerType: 'agent'</code>.</li>
            <li>Card creations transition to <code>ActionProposal(status: 'pending')</code>.</li>
            <li>Execution requires explicit interactive user callback via Telegram (<code>a:&lt;token&gt;</code>).</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
