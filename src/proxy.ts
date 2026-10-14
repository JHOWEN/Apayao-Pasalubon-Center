import { NextRequest, NextResponse } from "next/server";
import { canAccessAdminPortal, getUserForToken } from "@/lib/auth";

const adminPageRoots = [
  "/dashboard",
  "/admin-orders",
  "/admin-settings",
  "/analytics",
  "/categories",
  "/customers",
  "/inventory",
  "/pos",
  "/reports",
];

const staffRestrictedRoots = ["/dashboard", "/admin-orders", "/categories", "/inventory", "/customers"];

function matchesRoute(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`);
}

function redirectToLogin(request: NextRequest, reason: string, requestId: string) {
  const response = NextResponse.redirect(new URL(`/login?reason=${reason}`, request.url));
  response.headers.set("x-request-id", requestId);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  const isAdminPage = adminPageRoots.some((root) => matchesRoute(request.nextUrl.pathname, root))
    || request.nextUrl.pathname === "/products"
    || request.nextUrl.pathname === "/products/add";

  if (!isAdminPage) {
    const response = NextResponse.next();
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const token = request.cookies.get("token")?.value;
  if (!token) return redirectToLogin(request, "login-required", requestId);

  try {
    const user = await getUserForToken(token);
    if (!user) return redirectToLogin(request, "session-expired", requestId);
    if (user.isBlocked || !canAccessAdminPortal(user.role)) {
      return redirectToLogin(request, "access-denied", requestId);
    }
    if (user.role === "STAFF" && staffRestrictedRoots.some((root) => matchesRoute(request.nextUrl.pathname, root))) {
      const response = NextResponse.redirect(new URL("/pos", request.url));
      response.headers.set("x-request-id", requestId);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    const response = NextResponse.next();
    response.headers.set("x-request-id", requestId);
    return response;
  } catch {
    return new NextResponse("Unable to verify access. Please try again.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "x-request-id": requestId },
    });
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin-orders/:path*",
    "/admin-settings/:path*",
    "/analytics/:path*",
    "/categories/:path*",
    "/customers/:path*",
    "/inventory/:path*",
    "/pos/:path*",
    "/products",
    "/products/add/:path*",
    "/reports/:path*",
  ],
};