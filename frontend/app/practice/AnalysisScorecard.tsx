w"use client";

import React from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface Scores {
  clarity: number;
  confidence: number;
  structure: number;
  fluency: number;
  engagement: number;
}

interface AnalysisResponse {
  session_id: string;
  scores: Scores;
  tips: [string, string, string] | string[];
  transcript: string;
}

interface AnalysisScorecardProps {
  analysisResult: AnalysisResponse;
  onReset: () => void;
}

export default function AnalysisScorecard({
  analysisResult,
  onReset,
}: AnalysisScorecardProps) {
  const radarData = [
    { metric: "Clarity", score: analysisResult.scores.clarity, fullMark: 100 },
    { metric: "Confidence", score: analysisResult.scores.confidence, fullMark: 100 },
    { metric: "Structure", score: analysisResult.scores.structure, fullMark: 100 },
    { metric: "Fluency", score: analysisResult.scores.fluency, fullMark: 100 },
    { metric: "Engagement", score: analysisResult.scores.engagement, fullMark: 100 },
  ];

  return (
    <section
      id="analysis-scorecard-section"
      className="bg-white border border-slate-200 rounded-2xl p-6 shadow-md flex flex-col gap-8 animate-fadeIn"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">
            <svg
              className="w-4 h-4 text-emerald-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Analysis Complete
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            Delivery Assessment Scorecard
          </h2>
          <p className="text-xs text-slate-500">
            Session ID:{" "}
            <span className="font-mono text-slate-700 font-bold">
              {analysisResult.session_id}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onReset}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition"
          >
            New Practice Round
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Radar Chart (Recharts) */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-inner">
          <h3 className="text-sm font-bold text-slate-800 mb-2">
            5-Dimensional Competency Radar
          </h3>
          <div className="w-full h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                <PolarGrid stroke="#cbd5e1" strokeDasharray="3 3" />
                <PolarAngleAxis
                  dataKey="metric"
                  stroke="#475569"
                  tick={{ fill: "#1e293b", fontSize: 12, fontWeight: 700 }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  stroke="#94a3b8"
                  tick={{ fill: "#64748b", fontSize: 10 }}
                />
                <Radar
                  name="Delivery Score"
                  dataKey="score"
                  stroke="#4f46e5"
                  fill="#6366f1"
                  fillOpacity={0.35}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    borderColor: "#e2e8f0",
                    borderRadius: "8px",
                    color: "#0f172a",
                    fontSize: "12px",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Individual Dimension Cards */}
        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              key: "clarity",
              title: "Clarity",
              score: analysisResult.scores.clarity,
              desc: "Articulation and absence of ambiguity",
              color: "text-blue-700",
            },
            {
              key: "confidence",
              title: "Confidence",
              score: analysisResult.scores.confidence,
              desc: "Decisiveness and vocal authority",
              color: "text-emerald-700",
            },
            {
              key: "structure",
              title: "Structure",
              score: analysisResult.scores.structure,
              desc: "Logical sentence progression & flow",
              color: "text-violet-700",
            },
            {
              key: "fluency",
              title: "Fluency",
              score: analysisResult.scores.fluency,
              desc: "Cadence & low filler pause density",
              color: "text-amber-700",
            },
            {
              key: "engagement",
              title: "Engagement",
              score: analysisResult.scores.engagement,
              desc: "Rhetorical impact & persuasion",
              color: "text-sky-700",
            },
          ].map((item) => (
            <div
              key={item.key}
              className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between gap-2 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  {item.title}
                </span>
                <span
                  id={`score-${item.key}`}
                  className={`text-lg font-black ${item.color}`}
                >
                  {item.score}/100
                </span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-700"
                  style={{ width: `${item.score}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 font-medium">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* AI Coaching Tips (Exactly 3) */}
      <div className="pt-4 border-t border-slate-200">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
          <svg
            className="w-5 h-5 text-indigo-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          Claude AI Coaching Tips (Actionable Next Steps)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {analysisResult.tips.map((tip, idx) => (
            <div
              key={idx}
              className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100 flex flex-col gap-2 relative overflow-hidden shadow-sm"
            >
              <div className="flex items-center gap-2 text-indigo-700 text-xs font-bold font-mono">
                <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center border border-indigo-200">
                  {idx + 1}
                </span>
                Tip #{idx + 1}
              </div>
              <p className="text-xs text-slate-700 leading-relaxed font-medium">{tip}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
