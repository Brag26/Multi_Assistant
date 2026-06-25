"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Mode = "login" | "magic" | "forgot" | "forgot-sent" | "magic-sent";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = createSupabaseBrowserClient();

  async function handlePasswordLogin() {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      window.location.href = "/api/auth/callback?code=password";
    }
    setLoading(false);
  }

  async function handleMagicLink() {
    setLoading(true);
    setError("");
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/api/auth/callback` },
    });
    if (error) setError(error.message);
    else setMode("magic-sent");
    setLoading(false);
  }

  async function handleForgotPassword() {
    setLoading(true);
    setError("");
    const origin = window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/api/auth/reset`,
    });
    if (error) setError(error.message);
    else setMode("forgot-sent");
    setLoading(false);
  }

  return (
    <main className="min-h-screen flex" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12"
        style={{ background: "linear-gradient(135deg, #0f0c29, #1a1a4e, #24243e)" }}>

        {/* Animated grid */}
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }} />

        {/* Glow orbs */}
        <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #6366f1, transparent)" }} />
        <div className="absolute bottom-1/3 right-1/4 w-48 h-48 rounded-full opacity-15 blur-2xl"
          style={{ background: "radial-gradient(circle, #a855f7, transparent)" }} />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }}>
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <span className="text-white font-bold text-xl tracking-tight">VoiceOps</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(99,102,241,0.3)", color: "#a5b4fc" }}>AI</span>
          </div>
        </div>

        {/* Main copy */}
        <div className="relative z-10 space-y-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest mb-3"
              style={{ color: "#818cf8" }}>AI Voice Operations Platform</p>
            <h1 className="text-4xl font-bold leading-tight text-white">
              Automate every<br />
              <span style={{ background: "linear-gradient(90deg, #818cf8, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                voice conversation
              </span>
            </h1>
            <p className="mt-4 text-base leading-relaxed" style={{ color: "#94a3b8" }}>
              Connect your AI agents, phone numbers, and CRM in one place. Turn calls into qualified leads automatically.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 pt-2">
            {[
              { value: "10x", label: "More calls" },
              { value: "60%", label: "Cost savings" },
              { value: "24/7", label: "Always on" },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl p-3 text-center"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="text-xl font-bold text-white">{stat.value}</div>
                <div className="text-xs mt-0.5" style={{ color: "#64748b" }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div className="rounded-xl p-4"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-sm italic" style={{ color: "#94a3b8" }}>
              &ldquo;VoiceOps cut our lead response time from hours to seconds. Our conversion rate doubled.&rdquo;
            </p>
            <p className="mt-2 text-xs font-semibold" style={{ color: "#6366f1" }}>— Sales Director, FinTech Co.</p>
          </div>
        </div>

        <div className="relative z-10 text-xs" style={{ color: "#475569" }}>
          © 2026 VoiceOps · AI Voice Operations Platform
        </div>
      </div>

      {/* Right panel — auth forms */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <span className="font-bold text-slate-800">VoiceOps</span>
          </div>

          {/* ── Password Login ── */}
          {mode === "login" && (
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Welcome back</h2>
              <p className="mt-1 text-sm text-slate-500">Sign in to your VoiceOps account</p>

              <div className="mt-8 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
                  <input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handlePasswordLogin()}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-600">Password</label>
                    <button onClick={() => setMode("forgot")}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handlePasswordLogin()}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                  />
                </div>

                {error && (
                  <div className="rounded-lg px-3.5 py-2.5 text-sm text-red-700 bg-red-50 border border-red-100">
                    {error}
                  </div>
                )}

                <button
                  onClick={handlePasswordLogin}
                  disabled={!email || !password || loading}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}
                >
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </div>

              <div className="mt-5 flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400">or</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <button
                onClick={() => setMode("magic")}
                className="mt-4 w-full py-2.5 rounded-lg text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all"
              >
                ✉️ Sign in with magic link
              </button>
            </div>
          )}

          {/* ── Magic Link ── */}
          {mode === "magic" && (
            <div>
              <button onClick={() => setMode("login")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <h2 className="text-2xl font-bold text-slate-800">Magic link</h2>
              <p className="mt-1 text-sm text-slate-500">We&apos;ll send a sign-in link to your email</p>

              <div className="mt-8 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
                  <input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                  />
                </div>
                {error && (
                  <div className="rounded-lg px-3.5 py-2.5 text-sm text-red-700 bg-red-50 border border-red-100">
                    {error}
                  </div>
                )}
                <button
                  onClick={handleMagicLink}
                  disabled={!email || loading}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}
                >
                  {loading ? "Sending..." : "Send magic link"}
                </button>
              </div>
            </div>
          )}

          {/* ── Magic Link Sent ── */}
          {mode === "magic-sent" && (
            <div className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6"
                style={{ background: "linear-gradient(135deg, #ede9fe, #ddd6fe)" }}>
                <svg className="w-8 h-8" style={{ color: "#7c3aed" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Check your email</h2>
              <p className="mt-2 text-sm text-slate-500">
                We sent a magic link to <span className="font-medium text-slate-700">{email}</span>
              </p>
              <p className="mt-1 text-xs text-slate-400">Click the link in the email to sign in. It expires in 1 hour.</p>
              <button onClick={() => setMode("login")} className="mt-6 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                Back to sign in
              </button>
            </div>
          )}

          {/* ── Forgot Password ── */}
          {mode === "forgot" && (
            <div>
              <button onClick={() => setMode("login")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <h2 className="text-2xl font-bold text-slate-800">Reset password</h2>
              <p className="mt-1 text-sm text-slate-500">Enter your email and we&apos;ll send a reset link</p>

              <div className="mt-8 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
                  <input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                  />
                </div>
                {error && (
                  <div className="rounded-lg px-3.5 py-2.5 text-sm text-red-700 bg-red-50 border border-red-100">
                    {error}
                  </div>
                )}
                <button
                  onClick={handleForgotPassword}
                  disabled={!email || loading}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}
                >
                  {loading ? "Sending..." : "Send reset link"}
                </button>
              </div>
            </div>
          )}

          {/* ── Forgot Sent ── */}
          {mode === "forgot-sent" && (
            <div className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6"
                style={{ background: "linear-gradient(135deg, #dcfce7, #bbf7d0)" }}>
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Reset link sent</h2>
              <p className="mt-2 text-sm text-slate-500">
                Check <span className="font-medium text-slate-700">{email}</span> for your password reset link.
              </p>
              <p className="mt-1 text-xs text-slate-400">It expires in 1 hour. Check your spam folder if you don&apos;t see it.</p>
              <button onClick={() => setMode("login")} className="mt-6 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                Back to sign in
              </button>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}
