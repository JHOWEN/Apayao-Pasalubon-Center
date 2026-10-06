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
  "/products",
];

const staffRestrictedRoots = [
  "/dashboard",
  "/admin-orders",
  "/categories",
  "/inventory",
  "/customers",
];

function matchesRoute(pathname: string, root: string) {
  if (root === "/products") {
    return (
      pathname === root ||
      pathname === "/products/add" ||
      pathname.startsWith("/products/add/")
    );
  }
  return pathname === root || pathname.startsWith(`${root}/`);
}

function isAdminPage(pathname: string) {
  return adminPageRoots.some((root) => matchesRoute(pathname, root));
}

function isAdminApi(pathname: string) {
  return pathname === "/api/admin" || pathname.startsWith("/api/admin/");
}

function redirectToLogin(
  request: NextRequest,
  reason: string,
  requestId: string,
) {
  const response = NextResponse.redirect(
    new URL(`/login?reason=${reason}`, request.url),
  );
  response.headers.set("x-request-id", requestId);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function getRouteKey() {
  const key = process.env.ADMIN_ROUTE_KEY?.trim() ?? "";
  return /^[A-Za-z0-9_-]{32,}$/.test(key) ? key : null;
}

export async function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const routeKey = getRouteKey();
  const pathname = request.nextUrl.pathname;
  const keyPrefix = routeKey ? `/${routeKey}` : "";
  const isKeyedRequest = Boolean(
    keyPrefix &&
    (pathname === keyPrefix || pathname.startsWith(`${keyPrefix}/`)),
  );
  const internalPath = isKeyedRequest
    ? pathname.slice(keyPrefix.length) || "/"
    : pathname;
  const keyedAdminPage = isKeyedRequest && isAdminPage(internalPath);
  const keyedAdminApi = isKeyedRequest && isAdminApi(internalPath);
  const directAdminPage = !isKeyedRequest && isAdminPage(pathname);
  const directAdminApi = !isKeyedRequest && isAdminApi(pathname);

  if (isKeyedRequest && !keyedAdminPage && !keyedAdminApi) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (
    !keyedAdminPage &&
    !keyedAdminApi &&
    !directAdminPage &&
    !directAdminApi
  ) {
    const response = NextResponse.next();
    response.headers.set("x-request-id", requestId);
    return response;
  }

  if (!routeKey) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const token = request.cookies.get("token")?.value;
  if (!token) {
    if (keyedAdminApi || directAdminApi) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 },
      );
    }
    return redirectToLogin(request, "login-required", requestId);
  }

  try {
    const user = await getUserForToken(token);
    if (!user) {
      if (keyedAdminApi || directAdminApi) {
        return NextResponse.json(
          { success: false, message: "Unauthorized." },
          { status: 401 },
        );
      }
      return redirectToLogin(request, "session-expired", requestId);
    }
    if (user.isBlocked || !canAccessAdminPortal(user.role)) {
      if (keyedAdminApi || directAdminApi) {
        return NextResponse.json(
          { success: false, message: "Forbidden." },
          { status: 403 },
        );
      }
      return redirectToLogin(request, "access-denied", requestId);
    }

    if (
      (keyedAdminPage || directAdminPage) &&
      user.role === "STAFF" &&
      staffRestrictedRoots.some((root) => matchesRoute(internalPath, root))
    ) {
      const response = NextResponse.redirect(
        new URL(`${keyPrefix}/pos`, request.url),
      );
      response.headers.set("x-request-id", requestId);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    if (directAdminPage || directAdminApi) {
      const response = NextResponse.redirect(
        new URL(
          `${keyPrefix}${pathname}${request.nextUrl.search}`,
          request.url,
        ),
      );
      response.headers.set("x-request-id", requestId);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    const rewrittenUrl = request.nextUrl.clone();
    rewrittenUrl.pathname = internalPath;
    const response = NextResponse.rewrite(rewrittenUrl);
    response.headers.set("x-request-id", requestId);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return new NextResponse("Unable to verify access. Please try again.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "x-request-id": requestId },
    });
  }
}

export const config = {
  matcher: ["/:path*"],
};
