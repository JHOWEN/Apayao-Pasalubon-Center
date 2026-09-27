"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, KeyRound, AlertCircle, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { AuthCardLayout } from "@/components/auth/AuthCardLayout";
import { AuthInput } from "@/components/auth/AuthInput";
import { PasswordStrengthIndicator } from "@/components/auth/PasswordStrengthIndicator";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const hasResetDetails = Boolean(email && token);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!hasResetDetails) {
      setFeedback({
        type: "error",
        message: "This reset link is invalid or missing required details.",
      });
      return;
    }

    if (password.length < 8) {
      setFeedback({
        type: "error",
        message: "Password must be at least 8 characters.",
      });
      return;
    }

    if (password !== confirmPassword) {
      setFeedback({
        type: "error",
        message: "Passwords do not match.",
      });
      return;
    }

    setIsLoading(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password, confirmPassword }),
      });

      const data = await response.json();
      setIsLoading(false);

      if (!response.ok) {
        setFeedback({
          type: "error",
          message: data.message || "Unable to reset password.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: data.message || "Your password has been updated.",
      });
    } catch {
      setIsLoading(false);
      setFeedback({
        type: "error",
        message: "Unable to reset password.",
      });
    }
  }

  return (
    <AuthCardLayout
      title="Set a New Password"
      subtitle="Choose a strong password for your account"
      heroTitle="Secure Recovery"
      heroSubtitle="Your security is our priority. Choose a strong combination of characters."
      heroActionLink={{
        href: "/login",
        label: "SIGN IN",
      }}
      footer={
        <p className="text-center text-sm text-slate-600">
          Remember your password?{" "}
          <Link
            href="/login"
            className="font-semibold text-slate-800 transition hover:text-slate-900 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      {!hasResetDetails ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 rounded-xl border border-orange-200 bg-orange-50/80 p-5 text-slate-800"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Missing required details</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">
                The password reset link is missing the required email or token. Please request a new reset link.
              </p>
            </div>
          </div>
          <div className="pt-1">
            <Link
              href="/forgot-password"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-slate-900 px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              Request a new reset link
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </motion.div>
      ) : feedback?.type === "success" ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-xl border border-orange-200 bg-orange-50/80 p-6 text-center"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-orange-500 shadow-sm">
            <CheckCircle2 className="h-7 w-7 stroke-[2.5]" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            Password updated
          </h3>
          <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-slate-700">
            {feedback.message}
          </p>
          <div className="mt-6">
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 text-sm font-semibold uppercase tracking-[0.08em] text-white shadow-md transition hover:bg-slate-800"
            >
              <span>Back to sign in</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      ) : (
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
          onSubmit={handleSubmit}
          aria-label="Set new password form"
        >
          <AuthInput
            id="reset-password"
            name="password"
            label="New password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a strong password"
            icon={KeyRound}
            disabled={isLoading}
          />

          <AuthInput
            id="reset-confirmPassword"
            name="confirmPassword"
            label="Confirm password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
            icon={Lock}
            disabled={isLoading}
          />

          <PasswordStrengthIndicator
            password={password}
            confirmPassword={confirmPassword}
          />

          <AnimatePresence mode="wait">
            {feedback?.type === "error" ? (
              <motion.div
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                role="alert"
                className="flex items-start gap-2.5 overflow-hidden rounded-xl border border-orange-200 bg-orange-50/80 p-3.5 text-xs font-medium text-slate-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                <span className="flex-1">{feedback.message}</span>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <motion.button
            type="submit"
            whileHover={{ scale: isLoading ? 1 : 1.005 }}
            whileTap={{ scale: isLoading ? 1 : 0.99 }}
            disabled={isLoading}
            className="group relative mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-slate-900 px-6 text-sm font-semibold uppercase tracking-[0.08em] text-white shadow-md shadow-slate-900/10 transition-all hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-900/15 active:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-white" />
                <span>Resetting...</span>
              </>
            ) : (
              <>
                <span>RESET PASSWORD</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </motion.button>
        </motion.form>
      )}
    </AuthCardLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f5f5f4] p-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm font-medium text-slate-700 shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
            <span>Loading reset form...</span>
          </div>
        </main>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
