import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-slate-900 pt-24 pb-32">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3">
          <div className="w-96 h-96 bg-indigo-500/30 rounded-full blur-3xl"></div>
        </div>
        <div className="absolute bottom-0 left-0 translate-y-1/3 -translate-x-1/3">
          <div className="w-96 h-96 bg-blue-500/30 rounded-full blur-3xl"></div>
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium mb-8">
            <span className="flex h-2 w-2 rounded-full bg-indigo-400"></span>
            Voice Engine 2.0 Live
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-8 drop-shadow-sm">
            Master your <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">communication.</span>
          </h1>
          <p className="mt-4 text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed">
            Real-time speech analytics, AI debate opponents, and tailored mock interviews. Elevate your speaking skills with instant, actionable feedback.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/practice" className="w-full sm:w-auto px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg transition-all shadow-lg shadow-indigo-500/30 hover:scale-105">
              Start Practice Session
            </Link>
            <Link href="/dashboard" className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-lg transition-all border border-white/10 backdrop-blur-md">
              View Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">Three ways to improve</h2>
            <p className="mt-4 text-slate-600 max-w-2xl mx-auto">Choose a specialized training module to focus on different aspects of your communication skills.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <Link href="/practice" className="group rounded-2xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all">
              <div className="w-14 h-14 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform">
                🎙️
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Voice Analysis</h3>
              <p className="text-slate-600 leading-relaxed">
                Record your speech and get real-time feedback on filler words, pacing, and facial composure using advanced AI.
              </p>
            </Link>

            {/* Feature 2 */}
            <Link href="/debate" className="group rounded-2xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-xl hover:rose-200 transition-all">
              <div className="w-14 h-14 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform">
                ⚔️
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">AI Debate Opponent</h3>
              <p className="text-slate-600 leading-relaxed">
                Pick any topic and debate against an intelligent AI that will challenge your arguments and test your rhetoric.
              </p>
            </Link>

            {/* Feature 3 */}
            <Link href="/mock-interview" className="group rounded-2xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-xl hover:emerald-200 transition-all">
              <div className="w-14 h-14 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform">
                👔
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Mock Interview</h3>
              <p className="text-slate-600 leading-relaxed">
                Upload your resume and let our AI generate tailored questions, conducting a realistic back-and-forth interview.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
