"use client";

import { Check } from "lucide-react";

type AuthSuccessStateProps = {
  title: string;
  message: string;
};

export function AuthSuccessState({ title, message }: AuthSuccessStateProps) {
  return (
    <div className="flex min-h-90 flex-col items-center justify-center px-6 py-10 text-center" role="status" aria-live="polite">
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-orange-100 text-orange-600 shadow-[0_12px_30px_-12px_rgba(234,88,12,0.65)] animate-[auth-success-pop_500ms_cubic-bezier(0.22,1,0.36,1)_both]">
        <div className="absolute inset-0 rounded-full border border-orange-200 animate-[auth-success-ring_700ms_ease-out_100ms_both]" />
        <Check className="h-9 w-9 stroke-[2.5] animate-[auth-success-check_450ms_cubic-bezier(0.22,1,0.36,1)_150ms_both]" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-500">Success</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{message}</p>
    </div>
  );
}
