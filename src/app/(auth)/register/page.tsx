"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Mail, Lock, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { saveStoredUser } from "@/features/cart/lib/cart";
import { AuthSuccessState } from "@/components/auth/AuthSuccessState";
import { AuthCardLayout } from "@/components/auth/AuthCardLayout";
import { AuthInput } from "@/components/auth/AuthInput";
import { PasswordStrengthIndicator } from "@/components/auth/PasswordStrengthIndicator";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    gdprConsent: false,
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!form.gdprConsent) {
      setError("Please agree to the Terms and Conditions and Privacy Policy to continue.");
      return;
    }

    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      setIsLoading(false);

      if (!response.ok) {
        const errors = (data?.errors ?? {}) as Record<string, string[]>;
        const firstMessage =
          Object.values(errors)[0]?.[0] ?? data?.message ?? "Unable to create account.";
        setError(firstMessage);
        return;
      }

      if (data.user) {
        saveStoredUser(data.user);
        window.dispatchEvent(new Event("apc-user-updated"));
      }

      setIsSuccess(true);
      window.setTimeout(() => router.push("/"), 750);
    } catch {
      setIsLoading(false);
      setError("Unable to create account.");
    }
  }

  return (
    <AuthCardLayout
      title="Registration"
      subtitle="Create your account to get started."
      heroTitle="Join Us!"
      heroSubtitle="Sign up today to explore and shop authentic products from Apayao's finest artisans."
      heroActionLink={{
        href: "/login",
        label: "Login",
      }}
      footer={
        <p className="text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-slate-950 transition hover:text-black hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      {isSuccess ? (
        <AuthSuccessState
          title="Account created"
          message="Your account is ready. Taking you to the storefront now."
        />
      ) : (
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
          onSubmit={handleSubmit}
          aria-label="Create account form"
        >
          <AuthInput
            id="register-name"
            name="name"
            label="Username"
            type="text"
            required
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. juan.delacruz"
            icon={User}
            disabled={isLoading}
          />

          <AuthInput
            id="register-email"
            name="email"
            label="Email"
            type="email"
            required
            autoComplete="username"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="name@example.com"
            icon={Mail}
            disabled={isLoading}
          />

          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-4">
              <AuthInput
                id="register-password"
                name="password"
                label="Password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Create a password"
                icon={Lock}
                disabled={isLoading}
              />

              <AuthInput
                id="register-confirmPassword"
                name="confirmPassword"
                label="Confirm password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) =>
                  setForm({ ...form, confirmPassword: e.target.value })
                }
                placeholder="Re-enter your password"
                icon={Lock}
                disabled={isLoading}
              />
            </div>

            {/* Compact Password Strength Component */}
            <PasswordStrengthIndicator
              password={form.password}
              confirmPassword={form.confirmPassword}
            />
          </div>

          {/* Clean Terms & Conditions Checkbox (Section 8: Unboxed, clean alignment) */}
          <div className="pt-1">
            <label className="group flex cursor-pointer items-start gap-3 select-none">
              <input
                type="checkbox"
                required
                checked={form.gdprConsent}
                onChange={(e) =>
                  setForm({ ...form, gdprConsent: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-slate-900"
              />
              <span className="text-xs sm:text-sm leading-normal text-slate-600">
                I agree to the{" "}
                <Link
                  href="/terms?from=register"
                  className="font-semibold text-slate-800 underline decoration-slate-400 underline-offset-2 hover:text-slate-900 transition-colors"
                >
                  Terms and Conditions
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy?from=register"
                  className="font-semibold text-slate-800 underline decoration-slate-400 underline-offset-2 hover:text-slate-900 transition-colors"
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
          </div>

          {/* Error Message Alert */}
          <AnimatePresence mode="wait">
            {error ? (
              <motion.div
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                role="alert"
                className="flex items-start gap-2.5 overflow-hidden rounded-xl border border-orange-200 bg-orange-50/90 p-3.5 text-xs font-medium text-slate-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                <span className="flex-1">{error}</span>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Primary Action Button (Section 9: Full width, 52px height, 12px radius, orange brand color) */}
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
                <span>Creating account...</span>
              </>
            ) : (
              <>
                <span>SIGN UP</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </motion.button>
        </motion.form>
      )}
    </AuthCardLayout>
  );
}
