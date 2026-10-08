import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Urban Beats</p>
      <h1 className="mt-3 text-3xl font-semibold text-slate-100">Attendance</h1>

      <p className="mt-6 max-w-lg text-slate-400">
        This is the internal attendance-tracking system for Urban Beats dance studio. Admins manage students,
        classes, and rosters; teachers record daily attendance for the classes they teach. Attendance is
        automatically compiled into Excel sheets and backed up to the studio's own connected Google Drive.
      </p>

      <p className="mt-4 max-w-lg text-sm text-slate-500">
        This tool is for Urban Beats staff only — there's no public sign-up. If you're a student or parent looking
        for studio information, please contact the studio directly.
      </p>

      <Link
        href="/login"
        className="mt-10 rounded-xl bg-aura-blue px-6 py-3 text-sm font-medium text-white transition hover:bg-aura-blueSoft"
      >
        Staff sign in
      </Link>

      <div className="mt-16 flex gap-6 text-xs text-slate-600">
        <Link href="/privacy" className="hover:text-slate-400">
          Privacy Policy
        </Link>
        <Link href="/terms" className="hover:text-slate-400">
          Terms of Service
        </Link>
      </div>
    </div>
  );
}
