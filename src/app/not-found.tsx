import Link from "next/link";
import { Compass } from "lucide-react";

export default function RootNotFound() {
  return (
    <main className="min-h-screen bg-[#0a0d14] px-4 py-16 text-slate-100">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#12141c] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200">
          <Compass className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-white">Page not found</h1>
        <p className="mt-3 text-sm text-slate-400">
          The page you’re looking for does not exist or may have moved.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#ff8a1e] px-5 text-xs font-bold text-slate-950 transition hover:bg-[#f97316]"
          >
            Go to storefront
          </Link>
          <Link
            href="/orders"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
          >
            View my orders
          </Link>
        </div>
      </div>
    </main>
  );
}
