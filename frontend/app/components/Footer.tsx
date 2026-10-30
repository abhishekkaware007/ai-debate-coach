import React from "react";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-6 text-center">
      <p className="text-sm text-slate-500">
        © {new Date().getFullYear()} Orator – AI Debate & Interview Coach. All rights reserved.
      </p>
      <p className="mt-1 text-xs text-slate-400">
        Built with ❤️ using Next.js, FastAPI, Groq, and Claude AI.
      </p>
    </footer>
  );
}
