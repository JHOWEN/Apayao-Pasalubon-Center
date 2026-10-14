"use client";

import { QueryClient } from "@tanstack/react-query";
import { RequestTimeoutError } from "@/lib/client-fetch";

type CachedResponse = {
  body: string;
  status: number;
  statusText: string;
  contentType: string | null;
};

export type StorefrontDataEvent =
  | "storefront-products-updated"
  | "storefront-catalog-updated"
  | "storefront-reviews-updated"
  | "storefront-settings-updated"
  | "storefront-resync";

const cacheablePublicPaths = new Set([
  "/api/public/categories",
  "/api/public/products",
  "/api/public/settings",
]);

let browserQueryClient: QueryClient | undefined;

export function getPublicQueryClient() {
  if (typeof window === "undefined") return new QueryClient();

  browserQueryClient ??= new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: 30 * 60_000,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });

  return browserQueryClient;
}

function getRequestUrl(input: RequestInfo | URL) {
  const inputUrl = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
  return new URL(inputUrl, window.location.origin);
}

function isCacheablePublicRequest(url: URL, method: string) {
  return method === "GET" && url.origin === window.location.origin && cacheablePublicPaths.has(url.pathname);
}

function queryKeyForUrl(url: URL) {
  const normalizedUrl = new URL(url);
  normalizedUrl.searchParams.sort();
  return ["public-api", normalizedUrl.pathname, normalizedUrl.search] as const;
}

function responseFromCache(snapshot: CachedResponse) {
  return new Response(snapshot.body, {
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers: snapshot.contentType ? { "Content-Type": snapshot.contentType } : undefined,
  });
}

export async function publicFetch(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 15_000) {
  if (typeof window === "undefined") return fetch(input, init);

  const requestUrl = getRequestUrl(input);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (!isCacheablePublicRequest(requestUrl, method)) return fetch(input, init);

  const queryClient = getPublicQueryClient();
  const queryKey = queryKeyForUrl(requestUrl);
  if (init?.cache === "reload") {
    void queryClient.invalidateQueries({ queryKey, exact: true, refetchType: "none" });
  }

  const snapshot = await queryClient.fetchQuery<CachedResponse>({
    queryKey,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      const requestSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      const abortRequest = () => controller.abort(requestSignal?.reason);
      requestSignal?.addEventListener("abort", abortRequest, { once: true });

      try {
        const response = await fetch(input, { ...init, signal: controller.signal });
        return {
          body: await response.text(),
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get("content-type"),
        };
      } catch (error) {
        if (controller.signal.aborted && !requestSignal?.aborted) throw new RequestTimeoutError();
        throw error;
      } finally {
        window.clearTimeout(timeoutId);
        requestSignal?.removeEventListener("abort", abortRequest);
      }
    },
  });

  if (snapshot.status < 200 || snapshot.status >= 300) {
    queryClient.removeQueries({ queryKey, exact: true });
  }

  return responseFromCache(snapshot);
}

export function invalidatePublicDataForEvent(event: StorefrontDataEvent) {
  const paths =
    event === "storefront-products-updated" || event === "storefront-reviews-updated"
      ? ["/api/public/products"]
      : event === "storefront-catalog-updated"
        ? ["/api/public/products", "/api/public/categories"]
        : event === "storefront-settings-updated"
          ? ["/api/public/settings"]
          : [...cacheablePublicPaths];

  const queryClient = getPublicQueryClient();
  for (const pathname of paths) {
    void queryClient.invalidateQueries({
      queryKey: ["public-api", pathname],
      refetchType: "all",
    });
  }
}
