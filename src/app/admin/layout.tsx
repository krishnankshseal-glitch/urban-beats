import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/api/auth/session-expired");
  }

  return (
    <AppShell role="Admin" username={session.username}>
      {children}
    </AppShell>
  );
}
