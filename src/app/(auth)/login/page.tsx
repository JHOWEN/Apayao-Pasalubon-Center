"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, AlertCircle, Clock, Loader2, ArrowRight } from "lucide-react";
import { saveStoredUser } from "@/features/cart/lib/cart";
import { AuthSuccessState } from "@/components/auth/AuthSuccessState";
import { AuthCardLayout } from "@/components/auth/AuthCardLayout";
import { AuthInput } from "@/components/auth/AuthInput";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [lockoutEmail, setLockoutEmail] = useState("");
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const isLocked = lockoutSeconds > 0 && email.trim().toLowerCase() === lockoutEmail;

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");
    const message = reason === "session-expired"
      ? "Your session has expired. Please log in again."
      : reason === "access-denied"
        ? "Your account does not have access to the admin dashboard."
        : reason === "login-required"
          ? "Please log in to access the admin dashboard."
        : "";
    if (!message) return;

    const timeout = window.setTimeout(() => setError(message), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (lockoutSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setLockoutSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [lockoutSeconds]);

  function handleEmailChange(value: string) {
    setEmail(value);
    setError("");
    if (value.trim().toLowerCase() !== lockoutEmail) {
      setLockoutSeconds(0);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isLocked) {
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
      });

      const data = await response.json();
      setIsLoading(false);

      if (!response.ok) {
        setError(data?.message ?? "Unable to sign in.");
        if (response.status === 429) {
          setLockoutEmail(email.trim().toLowerCase());
          setLockoutSeconds(Number(data?.retryAfterSeconds) || 0);
        }
        return;
      }

      if (data.user) {
        saveStoredUser(data.user);
        window.dispatchEvent(new Event("apc-user-updated"));
      }

      if (data.user?.role === "ADMIN" || data.user?.role === "STAFF") {
        setIsSuccess(true);
        window.setTimeout(() => router.push("/dashboard"), 750);
        return;
      }

      setIsSuccess(true);
      window.setTimeout(() => router.push("/"), 750);
    } catch {
      setIsLoading(false);
      setError("We're having trouble connecting to our servers. Please check your internet connection and try refreshing the page.");
    }
  }

  return (
    <AuthCardLayout
      title="Login"
      subtitle="Welcome back! Please sign in to continue."
      heroTitle="Welcome Back!"
      heroSubtitle="To stay connected with us please login with your personal information."
      heroActionLink={undefined}
      footer={null}
    >
      {isSuccess ? (
        <AuthSuccessState
          title="Welcome back"
          message="Your account is ready. Taking you to your workspace now."
        />
      ) : (
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
          onSubmit={handleSubmit}
          aria-label="Sign in form"
          aria-busy={isLoading}
        >
          <AuthInput
            id="login-email"
            name="email"
            label="Email address"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            placeholder="name@example.com"
            icon={Mail}
            disabled={isLoading}
          />

          <AuthInput
            id="login-password"
            name="password"
            label="Password"
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            placeholder="Enter your password"
            icon={Lock}
            disabled={isLoading}
          />

          <div className="flex items-center justify-between gap-4 pt-1 text-xs sm:text-sm">
            <label className="group flex cursor-pointer select-none items-center gap-2 text-slate-600 transition hover:text-slate-900">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isLoading}
                className="h-4 w-4 rounded border-slate-300 accent-slate-900"
              />
              <span className="font-medium text-slate-600 group-hover:text-slate-900">
                Remember me
              </span>
            </label>
            <Link
              href="/forgot-password"
              className="font-medium text-slate-700 transition hover:text-slate-900 hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <AnimatePresence mode="wait">
            {error ? (
              <motion.div
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                role="alert"
                className={`flex items-start gap-2.5 overflow-hidden rounded-xl border p-3.5 text-xs font-medium ${
                  isLocked
                    ? "border-orange-200 bg-orange-50/90 text-slate-700"
                    : "border-orange-200 bg-orange-50/90 text-slate-700"
                }`}
              >
                {isLocked ? (
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                )}
                <div className="flex-1">
                  {isLocked
                    ? `Too many attempts. Please try again in ${Math.floor(
                        lockoutSeconds / 60
                      )}:${String(lockoutSeconds % 60).padStart(2, "0")}.`
                    : error}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <motion.button
            type="submit"
            whileHover={{ scale: isLocked || isLoading ? 1 : 1.005 }}
            whileTap={{ scale: isLocked || isLoading ? 1 : 0.99 }}
            disabled={isLoading || isLocked}
            className="group relative mt-2 flex h-12 min-h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-slate-900 px-6 text-sm font-semibold uppercase tracking-[0.08em] text-white shadow-md shadow-slate-900/10 transition-all hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-900/15 active:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-white" />
                <span>Signing in...</span>
              </>
            ) : isLocked ? (
              <span>Try again later</span>
            ) : (
              <>
                <span>SIGN IN</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </motion.button>

          <p className="pt-1 text-center text-sm text-slate-600">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-semibold text-slate-800 transition hover:text-slate-900 hover:underline"
            >
              Sign up
            </Link>
          </p>
        </motion.form>
      )}
    </AuthCardLayout>
  );
}
