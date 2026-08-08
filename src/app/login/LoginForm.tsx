"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PulseMark } from "@/components/PulseMark";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      router.push(data.redirectTo);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <PulseMark size="md" />
          <div>
            <p className="font-display text-xs uppercase tracking-[0.35em] text-slate-400">
              Urban Beats
            </p>
            <h1 className="font-display text-2xl font-semibold text-white">Attendance</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="glass-card space-y-4 p-6">
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-xs font-medium text-slate-400">
              Username
            </label>
            <input
              id="username"
              autoFocus
              autoComplete="username"
              className="field-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-medium text-slate-400">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-aura-red/10 px-3 py-2 text-sm text-aura-redSoft">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary disabled:opacity-60">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Accounts are created by your studio admin — there's no sign-up here.
        </p>
      </motion.div>
    </main>
  );
}
