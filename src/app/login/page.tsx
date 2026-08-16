import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const prisma = getDb();
  const existingCount = await prisma.user.count();
  if (existingCount === 0) {
    redirect("/setup");
  }

  return <LoginForm />;
}
