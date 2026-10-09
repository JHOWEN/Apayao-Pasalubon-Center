"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, MailCheck, AlertCircle, Loader2, ArrowRight, ArrowLeft, RefreshCw } from "lucide-react";
import { AuthCardLayout } from "@/components/auth/AuthCardLayout";
import { AuthInput } from "@/components/auth/AuthInput";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      setIsLoading(false);

      if (!response.ok || data.success === false) {
        const errorMessage = data.previewUrl
          ? `${data.message || "Unable to send reset link."}\nPreview: ${data.previewUrl}`
          : data.message || "Unable to send reset link.";

        setFeedback({ type: "error", message: errorMessage });
        return;
      }

      setFeedback({
        type: "success",
        message: data.message || "Check your inbox for the reset link.",
      });
    } catch {
      setIsLoading(false);
      setFeedback({
        type: "error",
        message: "Unable to send reset link.",
      });
    }
  }

  async function handleResend() {
    setIsResending(true);
    setResendMessage("");
    setResendError("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (!response.ok || data.success === false) {
        setResendError(data.message || "Unable to resend the email. Please try again.");
        return;
      }

      setResendMessage(data.message || "A new email has been sent.");
    } catch {
      setResendError("Unable to resend the email. Please try again.");
    } finally {
      setIsResending(false);
    }
  }

  const isSent = feedback?.type === "success";

  return (
    <AuthCardLayout
      title={isSent ? "Check Inbox" : "Reset Password"}
      subtitle={
        isSent
          ? "Use the secure link in the email to choose a new password."
          : "Provide the email linked to your account to recover your password"
      }
      heroTitle="Secure Recovery"
      heroSubtitle="Your security is our priority. Enter your email to receive recovery instructions."
      heroActionLink={{
        href: "/login",
        label: "SIGN IN",
      }}
      footer={
        <p className="text-center text-sm text-slate-600">
          Back to{" "}
          <Link
            href="/login"
            className="font-semibold text-slate-800 transition hover:text-slate-900 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      {isSent ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-4 rounded-xl border border-orange-200 bg-orange-50/80 p-6 shadow-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white shadow-md shadow-slate-900/10">
              <MailCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-base">Reset link sent</p>
              <p className="mt-1 wrap-break-words text-xs sm:text-sm leading-relaxed text-slate-700">
                {feedback.message}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                The link may take a minute to arrive. Check your spam folder if you don’t see it.
              </p>
            </div>
          </div>

          {resendMessage ? (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg bg-orange-100/80 px-3 py-2 text-center text-xs font-semibold text-slate-800"
              role="status"
            >
              {resendMessage}
            </motion.p>
          ) : null}

          {resendError ? (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-700"
              role="alert"
            >
              {resendError}
            </motion.p>
          ) : null}

          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <button
              type="button"
              onClick={handleResend}
              disabled={isResending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isResending ? "animate-spin" : ""}`}
              />
              {isResending ? "Resending..." : "Resend email"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFeedback(null);
                setResendMessage("");
                setResendError("");
              }}
              className="flex flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Use another email
            </button>
            <Link
              href="/login"
              className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Sign in
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
          aria-label="Forgot password form"
        >
          <AuthInput
            id="forgot-email"
            name="email"
            label="Email address"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            icon={Mail}
            disabled={isLoading}
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
                <div>
                  <p className="text-sm font-semibold text-slate-900">We couldn’t send the reset link</p>
                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-700">
                    {feedback.message}
                  </p>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <motion.button
            type="submit"
            whileHover={{ scale: isLoading ? 1 : 1.005 }}
            whileTap={{ scale: isLoading ? 1 : 0.99 }}
            disabled={isLoading}
            className="group relative mt-2 flex h-12 min-h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-slate-900 px-6 text-sm font-semibold uppercase tracking-[0.08em] text-white shadow-md shadow-slate-900/10 transition-all hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-900/15 active:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-white" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <span>SEND RESET LINK</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </motion.button>
        </motion.form>
      )}
    </AuthCardLayout>
  );
}
