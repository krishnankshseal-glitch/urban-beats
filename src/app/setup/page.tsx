import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const prisma = getDb();
  const existingCount = await prisma.user.count();
  if (existingCount > 0) {
    redirect("/login");
  }

  return <SetupForm />;
}
