import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "ub_session";

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

async function readRole(req: NextRequest): Promise<"ADMIN" | "TEACHER" | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const key = getSecretKey();
  if (!token || !key) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    return (payload.role as "ADMIN" | "TEACHER") ?? null;
  } catch {
    return null; // expired / tampered / unsigned — treat as logged out
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const role = await readRole(req);

  const isAuthPage = pathname === "/login";
  const isAdminArea = pathname.startsWith("/admin");
  const isTeacherArea = pathname.startsWith("/teacher");

  // Not logged in: only /login is reachable.
  if (!role && (isAdminArea || isTeacherArea)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Logged in: keep people out of /login and out of the other role's area.
  if (role && isAuthPage) {
    return NextResponse.redirect(new URL(role === "ADMIN" ? "/admin" : "/teacher", req.url));
  }
  if (role === "TEACHER" && isAdminArea) {
    return NextResponse.redirect(new URL("/teacher", req.url));
  }
  if (role === "ADMIN" && isTeacherArea) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(role ? (role === "ADMIN" ? "/admin" : "/teacher") : "/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/admin/:path*", "/teacher/:path*"],
};
