"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "./ui/Common";

type SessionRow = {
  id: string;
  lastActiveAt: string;
  user: { username: string; role: "ADMIN" | "TEACHER" };
};

export function SessionsPanel() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);

  async function load() {
    const res = await fetch("/api/admin/sessions");
    const data = await res.json();
    setSessions(data.sessions ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="glass-card p-5">
      <p className="mb-3 text-sm font-medium text-slate-200">
        Currently logged in {sessions ? `(${sessions.length})` : ""}
      </p>
      <div className="space-y-2">
        {sessions?.length === 0 && <p className="text-sm text-slate-500">No active sessions.</p>}
        {sessions?.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2 text-sm"
          >
            <div>
              <p className="text-slate-200">{s.user.username}</p>
              <p className="text-xs text-slate-500">
                {s.user.role.toLowerCase()} · last active {new Date(s.lastActiveAt).toLocaleString()}
              </p>
            </div>
            <Button
              variant="ghost"
              className="!px-2 !py-1 text-xs text-aura-redSoft"
              onClick={async () => {
                const res = await fetch(`/api/admin/sessions/${s.id}`, { method: "DELETE" });
                const data = await res.json().catch(() => null);
                if (data?.selfLoggedOut) {
                  router.push("/login");
                  return;
                }
                load();
              }}
            >
              <LogOut size={13} /> Log out
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
