"use client";

import { useState } from "react";
import ChatUI from "../components/ChatUI";

// API calls use relative paths — Next.js proxy (next.config.js) forwards them to the backend on port 8001.

export default function DebatePage() {
  const [topic, setTopic] = useState("");
  const [started, setStarted] = useState(false);

  if (!started) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-200 p-8 sm:p-12 text-center">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6">
            ⚔️
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-4">
            AI Debate Opponent
          </h1>
          <p className="text-lg text-slate-600 mb-8">
            Pick a motion. The AI will take the opposite stance and challenge your arguments.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (topic.trim()) setStarted(true);
            }}
            className="flex flex-col gap-4"
          >
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Remote work is better than office work"
              className="w-full border border-slate-300 rounded-xl px-5 py-4 text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 shadow-sm text-lg transition-all"
            />
            <button 
              type="submit" 
              disabled={!topic.trim()} 
              className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl px-5 py-4 text-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:hover:bg-rose-600 disabled:shadow-none"
            >
              Start Debate
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex flex-col max-w-5xl w-full py-12 px-4 sm:px-6 lg:px-8">
      <ChatUI
        title={`Debating: ${topic}`}
        apiUrl="/api/debate/chat"
        extraBody={{ topic }}
        starterPrompt="Make your opening argument — the AI will argue the other side."
      />
    </main>
  );
}
