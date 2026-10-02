"use client";

import { useState } from "react";

export type ChatMessage = { role: "user" | "assistant"; content: string };

type ChatUIProps = {
  title: string;
  apiUrl: string;
  extraBody?: Record<string, unknown>;
  starterPrompt?: string;
  initialAssistantMessage?: string;
};

export default function ChatUI({ title, apiUrl, extraBody, starterPrompt, initialAssistantMessage }: ChatUIProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialAssistantMessage ? [{ role: "assistant", content: initialAssistantMessage }] : []
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage(text: string) {
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: nextMessages, ...extraBody }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages([
        ...nextMessages,
        { role: "assistant", content: "Couldn't reach the backend. Is it running on port 8000?" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
  }

  return (
    <div className="chat-container">
      <h2>{title}</h2>
      <div className="chat-messages">
        {messages.length === 0 && starterPrompt && <p className="chat-hint">{starterPrompt}</p>}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        {loading && <div className="chat-bubble assistant loading">Thinking…</div>}
      </div>
      <form onSubmit={handleSubmit} className="chat-input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your answer…"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
