import Link from "next/link";
import { PackageSearch } from "lucide-react";

export default function EcommerceNotFound() {
  return (
    <main className="storefront-page-state min-h-screen bg-[#0a0d14] px-4 py-16 text-slate-100">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#12141c] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200">
          <PackageSearch className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-white">Product or page not found</h1>
        <p className="mt-3 text-sm text-slate-400">
          This item or page may have been removed, renamed, or is temporarily unavailable.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#ff8a1e] px-5 text-xs font-bold text-slate-950 transition hover:bg-[#f97316]"
          >
            Back to catalog
          </Link>
          <Link
            href="/orders"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
          >
            Check my orders
          </Link>
        </div>
      </div>
    </main>
  );
}
