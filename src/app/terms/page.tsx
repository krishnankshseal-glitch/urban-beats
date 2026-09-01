export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-slate-300">
      <h1 className="text-2xl font-semibold text-slate-100">Terms of Service</h1>
      <p className="mt-2 text-sm text-slate-500">Urban Beats Attendance — last updated {new Date().getFullYear()}</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <p>
          This app is an internal tool built for Urban Beats dance studio to manage class attendance. It's provided
          for use by the studio's own admins and teachers, as-is, with no warranty of any kind.
        </p>

        <section>
          <h2 className="font-medium text-slate-200">Acceptable use</h2>
          <p className="mt-1">
            Access is limited to studio staff with a valid login. Accounts should not be shared, and access should
            be used only for the studio's own attendance-tracking purposes.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-slate-200">Changes</h2>
          <p className="mt-1">
            These terms may be updated as the app changes. Continued use after a change means you accept the
            updated terms.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-slate-200">Contact</h2>
          <p className="mt-1">
            Questions can be directed to the studio administrator at{" "}
            <span className="text-slate-400">[add your contact email here]</span>.
          </p>
        </section>
      </div>
    </div>
  );
}
