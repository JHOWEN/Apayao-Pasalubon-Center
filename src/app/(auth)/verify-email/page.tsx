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
    <main className="flex min-h-screen items-center justify-center bg-[#f5f5f4] px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-16px_rgba(15,23,42,0.15)]">
        <div className="bg-slate-900 px-6 py-8 text-center text-white sm:px-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 ring-4 ring-orange-200">
            <div className="h-8 w-8 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Email verification</h1>
          <p className="mt-2 text-sm text-slate-300">We are checking your verification link.</p>
        </div>

        <div className="px-6 py-6 text-center sm:px-8">
          {status === "loading" ? (
            <div className="space-y-3">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
              <p className="text-sm text-slate-600">{message}</p>
            </div>
          ) : (
            <>
              <p className={`text-sm ${status === "success" ? "text-slate-800" : "text-slate-700"}`}>{message}</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link href="/login" className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
                  Go to login
                </Link>
                {status === "error" ? (
                  <Link href="/forgot-password" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
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
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#0a0f1d] px-4 py-8 sm:px-6 lg:px-8"><div className="rounded-3xl border border-slate-800/80 bg-white p-6 text-sm text-slate-700 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.5)]">Loading verification...</div></main>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
