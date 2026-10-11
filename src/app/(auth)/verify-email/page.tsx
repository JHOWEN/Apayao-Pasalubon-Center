"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    async function verify() {
      if (!email || !token) {
        setStatus("error");
        setMessage("The verification link is invalid or incomplete.");
        return;
      }

      try {
        const response = await fetch(`/api/auth/verify-email?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`);
        const data = await response.json();

        if (response.ok && data.success) {
          setStatus("success");
          setMessage(data.message || "Email verified successfully.");
        } else {
          setStatus("error");
          setMessage(data.message || "Unable to verify your email.");
        }
      } catch {
        setStatus("error");
        setMessage("Unable to verify your email. Please try again later.");
      }
    }

    verify();
  }, [email, token]);

  return (
    <main className="flex min-h-dvh items-start justify-center bg-[#f5f5f4] px-3 py-4 transition-colors sm:items-center sm:px-6 sm:py-8 lg:px-8 dark:bg-slate-950">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-16px_rgba(15,23,42,0.15)] transition-colors sm:rounded-3xl dark:border-slate-700 dark:bg-slate-900">
        <div className="bg-slate-900 px-5 py-6 text-center text-white sm:px-8 sm:py-8 dark:bg-slate-950">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 ring-4 ring-orange-200">
            <div className="h-8 w-8 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Email verification</h1>
          <p className="mt-2 text-sm text-slate-300">We are checking your verification link.</p>
        </div>

        <div className="px-5 py-6 text-center sm:px-8 sm:py-7">
          {status === "loading" ? (
            <div className="space-y-3">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
              <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
            </div>
          ) : (
            <>
              <p className={`text-sm ${status === "success" ? "text-slate-800 dark:text-slate-100" : "text-slate-700 dark:text-slate-200"}`}>{message}</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link href="/login" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800 sm:w-auto dark:bg-orange-500 dark:text-slate-950 dark:hover:bg-orange-400">
                  Go to login
                </Link>
                {status === "error" ? (
                  <Link href="/forgot-password" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-100 sm:w-auto dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    Need help?
                  </Link>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="flex min-h-dvh items-start justify-center bg-[#f5f5f4] px-3 py-4 sm:items-center sm:px-6 sm:py-8 lg:px-8 dark:bg-slate-950"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-700 shadow-xl sm:rounded-3xl sm:p-6 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Loading verification...</div></main>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
