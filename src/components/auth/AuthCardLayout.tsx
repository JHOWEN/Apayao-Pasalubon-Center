"use client";

import Image from "@/components/safe-image";
import { motion } from "framer-motion";
import { ReactNode } from "react";

interface AuthCardLayoutProps {
  badge?: string;
  title: string;
  subtitle: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroActionLink?: {
    href: string;
    label: string;
  };
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCardLayout({
  badge,
  title,
  subtitle,
  heroTitle = "Join Us!",
  heroSubtitle = "Sign up today to explore and shop authentic products from Apayao's finest artisans.",
  heroActionLink = {
    href: "/login",
    label: "SIGN IN",
  },
  children,
  footer,
}: AuthCardLayoutProps) {
  const logoSrc =
    process.env.NEXT_PUBLIC_APP_LOGO_URL ??
    "/logo/apc-inventory-logo-round.png";

  return (
    <main
      className="auth-page-layout relative flex min-h-dvh items-start justify-center bg-[#f5f5f4] px-3 py-4 selection:bg-slate-900 selection:text-white sm:items-center sm:px-6 sm:py-8 lg:px-8"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_55px_-22px_rgba(15,23,42,0.22)] sm:rounded-4xl"
      >
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="auth-hero-panel relative flex flex-col items-center justify-center overflow-hidden rounded-b-3xl border-b border-orange-200 bg-linear-to-br from-orange-100 via-orange-50 to-white px-5 py-6 text-center text-slate-900 sm:rounded-b-4xl sm:px-8 sm:py-9 lg:rounded-r-4xl lg:rounded-bl-none lg:border-b-0 lg:border-r lg:px-10 lg:py-12">
            <div className="absolute inset-0 opacity-50" style={{ backgroundImage: "radial-gradient(rgba(154, 52, 18, 0.12) 1px, transparent 1px)", backgroundSize: "18px 18px" }} />

            <div className="relative z-10 flex w-full max-w-77.5 flex-col items-center">
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#f4d7c7] p-1 shadow-[0_12px_28px_-14px_rgba(146,64,14,0.42)] ring-4 ring-orange-200/80 sm:mb-5 sm:h-24 sm:w-24 sm:p-1.5">
                <Image
                  src={logoSrc}
                  alt="APC Inventory logo"
                  width={92}
                  height={92}
                  className="h-full w-full rounded-full object-cover object-center"
                  priority
                />
              </div>

              <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-900/80">
                APAYAO PASALUBONG CENTER
              </h2>

              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:mt-6 sm:text-5xl">
                {heroTitle}
              </h1>

              <p className="mt-2 max-w-xs text-xs leading-relaxed text-slate-700 sm:mt-3 sm:text-sm">
                {heroSubtitle}
              </p>

              {heroActionLink ? null : null}
            </div>
          </section>

          <section className="auth-form-panel relative flex flex-col justify-center bg-white px-5 py-6 sm:px-10 sm:py-9 lg:px-12 lg:py-10">
            <div className="mx-auto w-full max-w-125">
              {badge || title || subtitle ? (
                <div className="mb-5 sm:mb-7">
                  {badge ? (
                    <span className="mb-2 inline-block rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      {badge}
                    </span>
                  ) : null}
                  {title ? (
                    <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                      {title}
                    </h2>
                  ) : null}
                  {subtitle ? (
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">
                      {subtitle}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {children}

              {footer ? <div className="mt-6 text-center">{footer}</div> : null}
            </div>
          </section>
        </div>
      </motion.div>
    </main>
  );
}
