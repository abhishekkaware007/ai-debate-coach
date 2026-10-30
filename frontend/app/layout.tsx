import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "AI Debate & Interview Coach | Voice Engine",
  description: "Real-time speech analytics, filler-word tracking, camera composure feed, and AI-powered delivery coaching.",
};

import Footer from "./components/Footer";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-indigo-500/20 selection:text-indigo-900 flex flex-col`}>
        <nav className="border-b border-slate-200 bg-white sticky top-0 z-50 shadow-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2 font-bold text-indigo-700 text-lg">
                <span className="bg-indigo-700 text-white w-8 h-8 rounded-lg flex items-center justify-center">🎙️</span>
                Orator
              </Link>
              <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
                <Link href="/dashboard" className="hover:text-indigo-700 transition">Dashboard</Link>
                <Link href="/practice" className="hover:text-indigo-700 transition">Practice</Link>
                <Link href="/debate" className="hover:text-indigo-700 transition">Debate</Link>
                <Link href="/mock-interview" className="hover:text-indigo-700 transition">Mock Interview</Link>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/practice" className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 transition">
                Start Session
              </Link>
            </div>
          </div>
        </nav>
        <div className="flex-1 flex flex-col">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}

