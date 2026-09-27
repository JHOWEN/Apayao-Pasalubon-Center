"use client";

import Image from "next/image";
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
    "/logo/apc-logo.png";

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#f5f5f4] px-4 py-8 sm:px-6 lg:px-8 selection:bg-slate-900 selection:text-white">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-5xl overflow-hidden rounded-4xl border border-slate-200 bg-white shadow-[0_20px_55px_-22px_rgba(15,23,42,0.22)]"
      >
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="relative flex flex-col items-center justify-center overflow-hidden rounded-b-4xl border-b border-orange-200 bg-linear-to-br from-orange-100 via-orange-50 to-white px-8 py-10 text-center text-slate-900 lg:rounded-r-4xl lg:rounded-bl-none lg:border-b-0 lg:border-r lg:px-10 lg:py-12">
            <div className="absolute inset-0 opacity-50" style={{ backgroundImage: "radial-gradient(rgba(154, 52, 18, 0.12) 1px, transparent 1px)", backgroundSize: "18px 18px" }} />

            <div className="relative z-10 flex w-full max-w-77.5 flex-col items-center">
              <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-[#f4d7c7] p-2.5 shadow-[0_12px_28px_-14px_rgba(146,64,14,0.42)] ring-4 ring-orange-200/80">
                <Image
                  src={logoSrc}
                  alt="APC Inventory logo"
                  width={92}
                  height={92}
                  className="h-full w-full rounded-full object-contain"
                  priority
                />
              </div>

              <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-900/80">
                APAYAO PASALUBONG CENTER
              </h2>

              <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
                {heroTitle}
              </h1>

              <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-700">
                {heroSubtitle}
              </p>

              {heroActionLink ? null : null}
            </div>
          </section>

          <section className="relative flex flex-col justify-center bg-white px-6 py-8 sm:px-10 sm:py-10 lg:px-12 lg:py-10">
            <div className="mx-auto w-full max-w-125">
              <div className="mb-7">
                {badge ? (
                  <span className="mb-2 inline-block rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    {badge}
                  </span>
                ) : null}
                <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                  {title}
                </h2>
                <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                  {subtitle}
                </p>
              </div>

              {children}

              {footer ? <div className="mt-6 text-center">{footer}</div> : null}
            </div>
          </section>
        </div>
      </motion.div>
    </main>
  );
}
