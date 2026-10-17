"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { getAdminQueryClient } from "@/components/providers/admin-query-provider";

type CachedResponse = {
  body: string;
  status: number;
  statusText: string;
  contentType: string | null;
};

type AdminRealtimeEvent =
  | "order-created"
  | "order-updated"
  | "inventory-updated"
  | "inventory-history-updated"
  | "catalog-updated"
  | "customer-updated"
  | "settings-updated"
  | "users-updated"
  | "admin-data-invalidated";

const ADMIN_SESSION_REFRESH_LOCK = "apc-admin-session-refresh";
let localAdminRefreshQueue: Promise<unknown> = Promise.resolve();

export function withAdminRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const lockManager =
    typeof navigator === "undefined"
      ? undefined
      : (navigator as unknown as {
          locks?: { request: (name: string, callback: () => Promise<T>) => Promise<T> };
        }).locks;

  if (lockManager) return lockManager.request(ADMIN_SESSION_REFRESH_LOCK, task);

  const queuedTask = localAdminRefreshQueue.then(task, task);
  localAdminRefreshQueue = queuedTask.then(() => undefined, () => undefined);
  return queuedTask;
}

const cacheableAdminPaths = new Set([
  "/api/auth/profile",
  "/api/admin/analytics",
  "/api/admin/categories",
  "/api/admin/customers",
  "/api/admin/dashboard",
  "/api/admin/inventory",
  "/api/admin/orders",
  "/api/admin/profile",
  "/api/admin/products",
  "/api/admin/receipt-settings",
  "/api/admin/reports",
  "/api/admin/settings",
  "/api/admin/system-status",
  "/api/admin/users",
]);

function queryKeyForUrl(url: URL): QueryKey {
  const normalizedUrl = new URL(url);
  normalizedUrl.searchParams.sort();
  return ["admin-api", normalizedUrl.pathname, normalizedUrl.search];
}

function cacheStaleTimeForPath(pathname: string) {
  if (pathname === "/api/auth/profile" || pathname === "/api/admin/profile") return 30_000;
  if (pathname === "/api/admin/system-status") return 60_000;
  return Number.POSITIVE_INFINITY;
}

function getRequestUrl(input: RequestInfo | URL) {
  const inputUrl = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
  return new URL(inputUrl, window.location.origin);
}

function isCacheableAdminRequest(url: URL, method: string) {
  return (
    method === "GET" &&
    url.origin === window.location.origin &&
    cacheableAdminPaths.has(url.pathname)
  );
}

function queryKeysForMutation(pathname: string) {
  if (pathname === "/api/admin/categories") {
    return [
      "/api/admin/categories",
      "/api/admin/products",
      "/api/admin/inventory",
      "/api/admin/dashboard",
      "/api/admin/analytics",
      "/api/admin/reports",
    ];
  }

  if (pathname.startsWith("/api/admin/products") || pathname.startsWith("/api/admin/variants")) {
    return [
      "/api/admin/products",
      "/api/admin/inventory",
      "/api/admin/dashboard",
      "/api/admin/analytics",
      "/api/admin/reports",
    ];
  }

  if (pathname === "/api/admin/inventory") {
    return [
      "/api/admin/inventory",
      "/api/admin/products",
      "/api/admin/dashboard",
      "/api/admin/analytics",
      "/api/admin/reports",
    ];
  }

  if (pathname === "/api/admin/orders" || pathname.startsWith("/api/admin/payments") || pathname === "/api/auth/orders") {
    return [
      "/api/admin/orders",
      "/api/admin/products",
      "/api/admin/inventory",
      "/api/admin/dashboard",
      "/api/admin/analytics",
      "/api/admin/reports",
      "/api/admin/customers",
    ];
  }

  if (pathname === "/api/admin/customers") return ["/api/admin/customers"];

  if (
    pathname.startsWith("/api/admin/settings") ||
    pathname.startsWith("/api/admin/profile") ||
    pathname === "/api/admin/payment-qr/upload"
  ) {
    return ["/api/admin/settings", "/api/admin/profile", "/api/auth/profile", "/api/admin/receipt-settings"];
  }

  if (pathname === "/api/admin/users") return ["/api/admin/users"];

  return [];
}

export function invalidateAdminApiPaths(queryClient: QueryClient, paths: string[]) {
  for (const pathname of new Set(paths)) {
    void queryClient.invalidateQueries({
      queryKey: ["admin-api", pathname],
      refetchType: "all",
    });
  }
}

export function invalidateCurrentAdminApiPaths(paths: string[]) {
  invalidateAdminApiPaths(getAdminQueryClient(), paths);
}

export function invalidateAdminDataForEvent(queryClient: QueryClient, event: AdminRealtimeEvent) {
  if (event === "inventory-updated") {
    invalidateAdminApiPaths(queryClient, [
      "/api/admin/inventory",
      "/api/admin/products",
      "/api/admin/dashboard",
      "/api/admin/analytics",
      "/api/admin/reports",
    ]);
    return;
  }

  if (event === "catalog-updated") {
    invalidateAdminApiPaths(queryClient, [
      "/api/admin/categories",
      "/api/admin/products",
      "/api/admin/inventory",
      "/api/admin/dashboard",
      "/api/admin/analytics",
      "/api/admin/reports",
    ]);
    return;
  }

  if (event === "inventory-history-updated") {
    invalidateAdminApiPaths(queryClient, ["/api/admin/inventory", "/api/admin/reports"]);
    return;
  }

  if (event === "customer-updated") {
    invalidateAdminApiPaths(queryClient, ["/api/admin/customers"]);
    return;
  }

  if (event === "settings-updated") {
    invalidateAdminApiPaths(queryClient, ["/api/admin/settings", "/api/admin/receipt-settings"]);
    return;
  }

  if (event === "users-updated") {
    invalidateAdminApiPaths(queryClient, ["/api/admin/users"]);
    return;
  }

  if (event === "admin-data-invalidated") {
    invalidateAdminApiPaths(queryClient, [...cacheableAdminPaths]);
    return;
  }

  invalidateAdminApiPaths(queryClient, [
    "/api/admin/orders",
    "/api/admin/products",
    "/api/admin/inventory",
    "/api/admin/dashboard",
    "/api/admin/analytics",
    "/api/admin/reports",
    "/api/admin/customers",
  ]);
}

function responseFromCache(snapshot: CachedResponse) {
  return new Response(snapshot.body, {
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers: snapshot.contentType ? { "Content-Type": snapshot.contentType } : undefined,
  });
}

async function fetchAdminResponse(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  requestUrl: URL,
  method: string,
) {
  const response = await fetch(input, init);
  const canRecoverAdminSession =
    response.status === 401 &&
    method === "GET" &&
    (requestUrl.pathname.startsWith("/api/admin/") || requestUrl.pathname === "/api/auth/profile");

  if (!canRecoverAdminSession) return response;

  return withAdminRefreshLock(async () => {
    // Another request may have refreshed the shared cookie while this request was in flight.
    const retriedResponse = await fetch(input, init);
    if (retriedResponse.status !== 401) return retriedResponse;

    let refreshResponse: Response;
    try {
      refreshResponse = await fetch("/api/auth/refresh", { method: "POST", cache: "no-store" });
    } catch {
      return retriedResponse;
    }

    if (!refreshResponse.ok && refreshResponse.status !== 409) return retriedResponse;
    return fetch(input, init);
  });
}

export async function adminFetch(input: RequestInfo | URL, init?: RequestInit) {
  const requestUrl = getRequestUrl(input);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const queryClient = getAdminQueryClient();

  if (isCacheableAdminRequest(requestUrl, method)) {
    const queryKey = queryKeyForUrl(requestUrl);
    if (init?.cache === "reload") {
      void queryClient.invalidateQueries({ queryKey, exact: true });
    }
    const snapshot = await queryClient.fetchQuery<CachedResponse>({
      queryKey,
      staleTime: cacheStaleTimeForPath(requestUrl.pathname),
      queryFn: async () => {
        const response = await fetchAdminResponse(input, init, requestUrl, method);
        return {
          body: await response.text(),
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get("content-type"),
        };
      },
    });

    if (snapshot.status < 200 || snapshot.status >= 300) {
      queryClient.removeQueries({ queryKey, exact: true });
    }

    return responseFromCache(snapshot);
  }

  const response = await fetchAdminResponse(input, init, requestUrl, method);
  if (method !== "GET" && response.ok && requestUrl.origin === window.location.origin) {
    invalidateAdminApiPaths(queryClient, queryKeysForMutation(requestUrl.pathname));
  }
  return response;
}
