"use client";

import { useState } from "react";
import ChatUI from "../components/ChatUI";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default function DebatePage() {
  const [topic, setTopic] = useState("");
  const [started, setStarted] = useState(false);

  if (!started) {
    return (
      <main className="page">
        <h1>AI Debate Opponent</h1>
        <p>Pick a motion. The AI will argue the opposite side.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (topic.trim()) setStarted(true);
          }}
        >
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Remote work is better than office work"
          />
          <button type="submit" disabled={!topic.trim()} style={{ marginTop: "0.75rem" }}>
            Start debate
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="page">
      <ChatUI
        title={`AI Debate Opponent — ${topic}`}
        apiUrl={`${BACKEND_URL}/api/debate/chat`}
        extraBody={{ topic }}
        starterPrompt="Make your opening argument — the AI will argue the other side."
      />
    </main>
  );
}
