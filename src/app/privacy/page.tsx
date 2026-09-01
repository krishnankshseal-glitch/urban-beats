export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-slate-300">
      <h1 className="text-2xl font-semibold text-slate-100">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Urban Beats Attendance — last updated {new Date().getFullYear()}</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <p>
          This is an internal attendance-tracking tool used by Urban Beats dance studio to manage class rosters and
          record attendance. It is not a public product and is not offered to anyone outside the studio's own
          administration and teaching staff.
        </p>

        <section>
          <h2 className="font-medium text-slate-200">What information is stored</h2>
          <p className="mt-1">
            Student names, an optional parent phone number, and daily attendance records for enrolled classes.
            Teacher and admin accounts store a username and a securely hashed password — actual passwords are never
            stored in readable form.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-slate-200">Google Drive access</h2>
          <p className="mt-1">
            When an administrator connects a Google account, this app creates a single folder in that Google
            account's own Drive and saves attendance as Excel files there, as a backup. The app can only see and
            manage files it creates itself — it cannot browse, read, or modify anything else already in that Google
            account's Drive.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-slate-200">Sharing</h2>
          <p className="mt-1">
            Data is not sold, rented, or shared with any third party. It is used solely to run attendance tracking
            for this studio.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-slate-200">Contact</h2>
          <p className="mt-1">
            Questions about this policy or your data can be directed to the studio administrator at{" "}
            <span className="text-slate-400">[add your contact email here]</span>.
          </p>
        </section>
      </div>
    </div>
  );
}
