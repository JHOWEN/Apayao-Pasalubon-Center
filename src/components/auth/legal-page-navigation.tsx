"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

type LegalPage = "terms" | "privacy";

const pageDetails: Record<LegalPage, { title: string; href: string }> = {
  terms: { title: "privacy policy", href: "/privacy" },
  privacy: { title: "terms and conditions", href: "/terms" },
};

function NavigationLinks({ page, fromRegistration }: { page: LegalPage; fromRegistration: boolean }) {
  const companion = pageDetails[page];

  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link href={fromRegistration ? "/register" : "/"} className="inline-flex rounded-2xl bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-600">
        {fromRegistration ? "Back to registration" : "Back to store"}
      </Link>
      <Link
        href={fromRegistration ? `${companion.href}?from=register` : `${companion.href}?from=store`}
        className="inline-flex rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        Read {companion.title}
      </Link>
    </div>
  );
}

export function LegalPageNavigationFallback({ page }: { page: LegalPage }) {
  return <NavigationLinks page={page} fromRegistration={false} />;
}

export default function LegalPageNavigation({ page }: { page: LegalPage }) {
  const fromRegistration = useSearchParams().get("from") === "register";
  return <NavigationLinks page={page} fromRegistration={fromRegistration} />;
}
