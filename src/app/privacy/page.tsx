export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-slate-300">
      <h1 className="text-2xl font-semibold text-slate-100">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Urban Beats Attendance — last updated {new Date().getFullYear()}</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <p>
          This is an internal attendance-tracking tool built for Urban Beats dance studio to manage class rosters
          and record attendance. It is not a public product and is not offered to anyone outside the studio's own
          administration and teaching staff. This policy explains what information the app stores and, in
          particular, exactly what it does with Google user data.
        </p>

        <section>
          <h2 className="font-medium text-slate-200">Information stored about students and staff</h2>
          <p className="mt-1">
            Student names, an optional parent phone number, and daily attendance records for enrolled classes.
            Teacher and admin accounts store a username and a securely hashed password — actual passwords are
            never stored in readable form, by us or anyone else.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-slate-200">Google user data: exactly what is accessed and why</h2>
          <p className="mt-1">
            When a studio administrator chooses to connect a Google account from this app's Settings page, we
            request exactly two permissions from Google, and nothing more:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Your Google Account email address</strong> — used only to show the administrator which
              Google account is currently connected, so they can confirm it's the right one.
            </li>
            <li>
              <strong>Per-file Google Drive access (the "drive.file" scope)</strong> — this is a restricted form of
              Drive access: the app can only see, create, and edit files that it itself creates. It cannot browse,
              read, search, or modify any other file already in that Google account's Drive, and it has no access
              to Drive content belonging to any other Google account.
            </li>
          </ul>
          <p className="mt-2">
            In practice, this access is used for exactly one purpose: creating a single "Urban Beats Attendance"
            folder in the connected account's Drive, and saving generated attendance Excel files into it as an
            automatic backup. Google user data is never used for advertising, never analyzed for any purpose
            beyond this backup, and never transferred to any third party.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-slate-200">How this data is protected</h2>
          <p className="mt-1">
            The Google account credential that allows this backup (an OAuth refresh token) is encrypted before
            being stored, using industry-standard authenticated encryption, and is never written to logs or shown
            to anyone, including the app's own administrators.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-slate-200">Revoking access and data deletion</h2>
          <p className="mt-1">
            An administrator can disconnect the Google account at any time from the Settings page. Doing so both
            deletes the stored credential from this app's database and revokes the app's access directly through
            Google's own systems — the same as if you'd removed the app from your Google Account's third-party
            access page yourself. No Google user data is retained after disconnecting.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-slate-200">Sharing</h2>
          <p className="mt-1">
            No data of any kind — student information, staff information, or Google user data — is sold, rented,
            or shared with any third party. Everything described here is used solely to run attendance tracking
            and backups for this one studio.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-slate-200">Contact</h2>
          <p className="mt-1">
            Questions about this policy, or requests regarding your data, can be directed to the studio
            administrator at <span className="text-slate-400">[add your contact email here]</span>.
          </p>
        </section>
      </div>
    </div>
  );
}
