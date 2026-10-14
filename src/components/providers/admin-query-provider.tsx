"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let browserQueryClient: QueryClient | undefined;

export function getAdminQueryClient() {
  if (typeof window === "undefined") return new QueryClient();

  browserQueryClient ??= new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });

  return browserQueryClient;
}

export function AdminQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => getAdminQueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
