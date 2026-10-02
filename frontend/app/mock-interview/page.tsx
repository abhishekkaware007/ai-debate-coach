"use client";

import { useState } from "react";
import ChatUI from "../components/ChatUI";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default function MockInterviewPage() {
  const [questions, setQuestions] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${BACKEND_URL}/api/mock-interview/resume-questions`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      setQuestions(data.questions);
    } catch {
      setError("Couldn't generate questions from that file. Is the backend running?");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="page">
      <section className="resume-section">
        <h2>Resume-based questions</h2>
        <p>Upload a PDF or .txt resume to get 5 tailored interview questions.</p>
        <input type="file" accept=".pdf,.txt" onChange={handleResumeUpload} disabled={uploading} />
        {uploading && <p>Generating questions…</p>}
        {error && <p className="error">{error}</p>}
        {questions.length > 0 && (
          <ul className="question-list">
            {questions.map((q, i) => (
              <li key={i} className="question-item" onClick={() => setActiveQuestion(q)}>
                {q}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ChatUI
        key={activeQuestion ?? "default"}
        title="AI Mock Interviewer"
        apiUrl={`${BACKEND_URL}/api/mock-interview/chat`}
        initialAssistantMessage={activeQuestion ?? undefined}
        starterPrompt="Type anything to start — the AI will ask you the first question."
      />
    </main>
  );
}
