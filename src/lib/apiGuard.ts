import { NextResponse } from "next/server";
import { AuthError, requireRole, SessionUser } from "./auth";
import type { Role } from "@prisma/client";

export async function withRole(
  role: Role,
  handler: (session: SessionUser) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const session = await requireRole(role);
    return await handler(session);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.code === "UNAUTHENTICATED" ? "Please log in." : "You don't have access to this." },
        { status: err.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: "Something went wrong on our end." }, { status: 500 });
  }
}
