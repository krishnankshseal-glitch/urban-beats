"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck2, Users, ChevronRight } from "lucide-react";
import { EmptyState, FadeIn } from "@/components/ui/Common";

type ClassCard = { id: string; name: string; schedule: string | null; studentCount: number };

export default function TeacherDashboard() {
  const [classes, setClasses] = useState<ClassCard[] | null>(null);

  useEffect(() => {
    fetch("/api/teacher/classes")
      .then((r) => r.json())
      .then((d) => setClasses(d.classes ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-xs uppercase tracking-[0.3em] text-slate-500">Your classes</p>
        <h1 className="font-display text-2xl font-semibold text-white">Pick a class to take attendance</h1>
      </div>

      {classes?.length === 0 && (
        <EmptyState
          title="No classes assigned yet"
          description="Your studio admin assigns classes to your account — check back soon."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {classes?.map((c, i) => (
          <FadeIn key={c.id} delay={i * 0.05}>
            <Link
              href={`/teacher/attendance/${c.id}`}
              className="glass-card group flex items-center justify-between p-5 transition hover:border-white/20"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5">
                  <CalendarCheck2 size={19} className="text-aura-blueSoft" />
                </div>
                <div>
                  <p className="font-medium text-slate-100">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.schedule || "No schedule set"}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                    <Users size={12} /> {c.studentCount} student{c.studentCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
            </Link>
          </FadeIn>
        ))}
      </div>
    </div>
  );
}
