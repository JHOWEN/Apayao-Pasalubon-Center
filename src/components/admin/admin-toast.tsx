"use client";

import { useEffect } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, X } from "lucide-react";

export type AdminToastType = "success" | "error" | "warning";

type AdminToastProps = {
  type: AdminToastType;
  message: string;
  title?: string;
  onDismiss: () => void;
  duration?: number;
};

const toastStyles: Record<AdminToastType, { icon: typeof CheckCircle2; accent: string; iconBackground: string }> = {
  success: {
    icon: CheckCircle2,
    accent: "text-emerald-700 dark:text-emerald-300",
    iconBackground: "bg-emerald-100 dark:bg-emerald-950/60",
  },
  error: {
    icon: AlertCircle,
    accent: "text-rose-700 dark:text-rose-300",
    iconBackground: "bg-rose-100 dark:bg-rose-950/60",
  },
  warning: {
    icon: AlertTriangle,
    accent: "text-amber-700 dark:text-amber-300",
    iconBackground: "bg-amber-100 dark:bg-amber-950/60",
  },
};

export function AdminToast({ type, message, title, onDismiss, duration = 3200 }: AdminToastProps) {
  const { icon: Icon, accent, iconBackground } = toastStyles[type];

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      className="fixed left-1/2 top-20 z-100 flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-xl animate-in fade-in slide-in-from-top-2 dark:border-slate-700 dark:bg-slate-900"
    >
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconBackground} ${accent}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        {title && <span className={`block text-xs font-bold ${accent}`}>{title}</span>}
        <span className="block wrap-break-word text-xs font-medium text-slate-700 dark:text-slate-200">{message}</span>
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-mr-1 -mt-1 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}