"use client";

import { useState } from "react";
import ChatUI from "../components/ChatUI";

// API calls use relative paths — Next.js proxy (next.config.js) forwards them to the backend on port 8000.

export default function MockInterviewPage() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [resumeContext, setResumeContext] = useState<string>("");
  const [selectedResume, setSelectedResume] = useState<string | null>(null);

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedResume(file.name);
    e.target.value = "";
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/mock-interview/start-interview`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.detail || `Upload failed (Status ${res.status})`);
      }
      const data = await res.json();
      setActiveQuestion(data.first_question);
      setResumeContext(data.resume_context || "");
    } catch (err: any) {
      setError(err?.message || "Couldn't start the interview from that resume. Please check the backend.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="mx-auto flex flex-col max-w-7xl w-full py-12 px-4 sm:px-6 lg:px-8">
      <div className="grid lg:grid-cols-[1fr_2fr] gap-8 items-start">
        <section className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center text-2xl mb-4">
            👔
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Resume Upload</h2>
          <p className="text-slate-600 mb-6 text-sm">
            Upload your resume (PDF or TXT) to begin a live interview tailored to your experience.
          </p>
          
          <label htmlFor="resume-file" className={`block w-full border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${uploading ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/50'}`}>
            <span className="block text-emerald-700 font-medium">{uploading ? "Analyzing resume..." : selectedResume ?? "Choose your resume"}</span>
            <span className="mt-1 block text-xs text-slate-500">PDF, DOCX, or TXT</span>
            <input 
              id="resume-file"
              type="file" 
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" 
              onChange={handleResumeUpload} 
              disabled={uploading} 
              className="sr-only"
            />
          </label>
          
          {error && (
            <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {activeQuestion && (
            <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="font-bold text-emerald-900 mb-2 text-sm uppercase tracking-wider">Interview started</h3>
              <p className="text-sm text-emerald-800">The interview is now running from your resume. Answer naturally and the AI interviewer will continue with the next question automatically.</p>
            </div>
          )}
        </section>

        <section className="h-full">
          <ChatUI
            title="AI Mock Interviewer"
            apiUrl="/api/mock-interview/chat"
            extraBody={{ resume_context: resumeContext }}
            initialAssistantMessage={activeQuestion ?? undefined}
            starterPrompt={activeQuestion ? "Answer the question naturally. Your voice will be detected automatically." : "Upload a resume to begin the interview automatically."}
          />
        </section>
      </div>
    </main>
  );
}
