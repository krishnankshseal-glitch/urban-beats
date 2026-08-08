import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell, NavItem } from "@/components/AppShell";
import { LayoutDashboard } from "lucide-react";

const navItems: NavItem[] = [{ label: "My classes", href: "/teacher", icon: LayoutDashboard }];

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "TEACHER") {
    redirect("/login");
  }

  return (
    <AppShell role="Teacher" username={session.username} navItems={navItems}>
      {children}
    </AppShell>
  );
}
