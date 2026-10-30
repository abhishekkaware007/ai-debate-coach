"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Scores {
  clarity: number;
  confidence: number;
  structure: number;
  fluency: number;
  engagement: number;
}

interface Session {
  session_id: string;
  date: string;
  scores: Scores;
  tips: string[];
  transcript: string;
}

const scoreLabels: { key: keyof Scores; label: string }[] = [
  { key: "clarity", label: "Clarity" },
  { key: "confidence", label: "Confidence" },
  { key: "structure", label: "Structure" },
  { key: "fluency", label: "Fluency" },
  { key: "engagement", label: "Engagement" },
];

function averageScore(scores: Scores) {
  const values = Object.values(scores);
  return Math.round(values.reduce((total, score) => total + score, 0) / values.length);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DashboardPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/sessions")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load practice history.");
        return response.json() as Promise<Session[]>;
      })
      .then((data) => {
        if (!active) return;
        setSessions(data);
        setSelectedId(data[0]?.session_id ?? null);
      })
      .catch(() => {
        if (active) setError("Could not connect to the backend. Start the FastAPI server and refresh.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedSession = sessions.find(
    (session) => session.session_id === selectedId,
  );
  const average = sessions.length
    ? Math.round(
        sessions.reduce((total, session) => total + averageScore(session.scores), 0) /
          sessions.length,
      )
    : 0;
  const best = sessions.length
    ? Math.max(...sessions.map((session) => averageScore(session.scores)))
    : 0;
  const chartData = [...sessions].reverse().map((session) => ({
    date: formatDate(session.date),
    score: averageScore(session.scores),
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-indigo-700">
            AI Debate &amp; Interview Coach
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Practice dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Your completed practice sessions and coaching feedback.
          </p>
        </div>
        <a
          href="/practice"
          className="inline-flex w-fit items-center justify-center rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800"
        >
          Start a practice session
        </a>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </p>
      )}

      <section aria-label="Practice summary" className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Sessions completed", value: sessions.length },
          { label: "Average score", value: `${average}/100` },
          { label: "Personal best", value: `${best}/100` },
        ].map((stat) => (
          <article key={stat.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{stat.value}</p>
          </article>
        ))}
      </section>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">Loading practice history...</p>
      ) : sessions.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="text-lg font-bold text-slate-900">No sessions yet</h2>
          <p className="mt-2 text-sm text-slate-600">
            Complete a practice round and its analysis will appear here.
          </p>
          <a href="/practice" className="mt-5 inline-flex text-sm font-semibold text-indigo-700 hover:text-indigo-900">
            Go to practice <span aria-hidden="true">-&gt;</span>
          </a>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-slate-900">Score trend</h2>
              <p className="mt-1 text-sm text-slate-500">Average score across your saved sessions</p>
            </div>
            <div className="h-64 w-full" role="img" aria-label="Average scores over time">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" name="Average score" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, fill: "#4f46e5" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <h2 className="mb-3 mt-6 text-lg font-bold text-slate-900">Session history</h2>
            <div className="divide-y divide-slate-100">
              {sessions.map((session) => (
                <button
                  key={session.session_id}
                  type="button"
                  onClick={() => setSelectedId(session.session_id)}
                  aria-pressed={selectedId === session.session_id}
                  className={`flex w-full items-center justify-between gap-4 py-3 text-left transition ${selectedId === session.session_id ? "text-indigo-800" : "text-slate-700 hover:text-indigo-700"}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{session.transcript.slice(0, 72) || "Practice session"}</span>
                    <span className="mt-1 block text-xs text-slate-500">{formatDate(session.date)}</span>
                  </span>
                  <span className="shrink-0 font-mono text-lg font-bold">{averageScore(session.scores)}</span>
                </button>
              ))}
            </div>
          </section>

          {selectedSession && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{formatDate(selectedSession.date)}</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">Session feedback</h2>
                </div>
                <span className="shrink-0 rounded-md bg-indigo-50 px-2.5 py-1 font-mono text-sm font-bold text-indigo-800">
                  {averageScore(selectedSession.scores)}/100
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {scoreLabels.map(({ key, label }) => (
                  <div key={key}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-slate-600">{label}</span>
                      <span className="font-semibold text-slate-900">{selectedSession.scores[key]}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-indigo-600" style={{ width: `${selectedSession.scores[key]}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <h3 className="mb-2 mt-6 text-sm font-bold text-slate-900">Coach&apos;s notes</h3>
              <ul className="space-y-2 text-sm leading-relaxed text-slate-600">
                {selectedSession.tips.map((tip, index) => <li key={`${index}-${tip}`}>{tip}</li>)}
              </ul>
              <h3 className="mb-2 mt-6 text-sm font-bold text-slate-900">Transcript</h3>
              <p className="max-h-40 overflow-y-auto rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">
                {selectedSession.transcript}
              </p>
            </section>
          )}
        </div>
      )}
    </main>
  );
}