import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "TEACHER") {
    redirect("/login");
  }

  return (
    <AppShell role="Teacher" username={session.username}>
      {children}
    </AppShell>
  );
}
