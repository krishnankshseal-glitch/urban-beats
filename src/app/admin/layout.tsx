import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell, NavItem } from "@/components/AppShell";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  CalendarCheck2,
  FileSpreadsheet,
  ShieldCheck,
  Settings,
} from "lucide-react";

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Teachers", href: "/admin/teachers", icon: GraduationCap },
  { label: "Classes", href: "/admin/classes", icon: CalendarCheck2 },
  { label: "Students", href: "/admin/students", icon: Users },
  { label: "Attendance", href: "/admin/attendance", icon: FileSpreadsheet },
  { label: "Admins", href: "/admin/admins", icon: ShieldCheck },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/login");
  }

  return (
    <AppShell role="Admin" username={session.username} navItems={navItems}>
      {children}
    </AppShell>
  );
}
