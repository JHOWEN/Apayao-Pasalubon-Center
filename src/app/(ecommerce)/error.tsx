'use client';

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function EcommerceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="storefront-page-state min-h-screen bg-[#0a0d14] px-4 py-16 text-slate-100">
      <div className="mx-auto max-w-lg rounded-2xl border border-amber-500/30 bg-[#12141c] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10 text-amber-300">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
        <p className="mt-3 text-sm text-slate-400">
          We couldn&apos;t finish loading this page. Your cart and account are still safe. Please try again, or continue browsing the catalog.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ff8a1e] px-5 text-xs font-bold text-slate-950 transition hover:bg-[#f97316]"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
          >
            Browse catalog
          </Link>
        </div>
      </div>
    </main>
  );
}
