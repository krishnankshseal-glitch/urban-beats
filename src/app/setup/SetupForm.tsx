"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PulseMark } from "@/components/PulseMark";

export function SetupForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/setup/create-admin", {
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
            <h1 className="font-display text-2xl font-semibold text-white">Set up your studio</h1>
            <p className="mt-2 max-w-xs text-sm text-slate-400">
              This runs once. Create your admin login below — you'll create every other account
              from inside the app after this.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="glass-card space-y-4 p-6">
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-xs font-medium text-slate-400">
              Admin username
            </label>
            <input
              id="username"
              autoFocus
              autoComplete="username"
              className="field-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
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
              autoComplete="new-password"
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirm" className="text-xs font-medium text-slate-400">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              className="field-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-aura-red/10 px-3 py-2 text-sm text-aura-redSoft">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary disabled:opacity-60">
            {loading ? "Creating admin account…" : "Create admin account"}
          </button>
        </form>
      </motion.div>
    </main>
  );
}
