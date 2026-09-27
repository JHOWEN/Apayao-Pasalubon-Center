"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";

interface PasswordStrengthIndicatorProps {
  password: string;
  confirmPassword?: string;
  showRules?: boolean;
}

export function PasswordStrengthIndicator({
  password,
  confirmPassword,
  showRules = true,
}: PasswordStrengthIndicatorProps) {
  const analysis = useMemo(() => {
    const hasMinLength = password.length >= 8;
    const hasNumberOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
    const hasMixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password);

    let score = 0;
    if (hasMinLength) score += 1;
    if (hasMixedCase) score += 1;
    if (hasNumberOrSymbol) score += 1;

    let strengthLabel = "Weak";
    let strengthColor = "bg-orange-500";
    let textClass = "text-orange-600";

    if (password.length > 0) {
      if (score === 1) {
        strengthLabel = "Weak";
        strengthColor = "bg-orange-500";
        textClass = "text-orange-600";
      } else if (score === 2) {
        strengthLabel = "Medium";
        strengthColor = "bg-slate-900";
        textClass = "text-slate-800";
      } else if (score === 3) {
        strengthLabel = "Strong";
        strengthColor = "bg-orange-500";
        textClass = "text-orange-600";
      }
    }

    const matchesConfirm =
      confirmPassword !== undefined &&
      confirmPassword.length > 0 &&
      password === confirmPassword;

    const hasConfirmMismatch =
      confirmPassword !== undefined &&
      confirmPassword.length > 0 &&
      password !== confirmPassword;

    return {
      hasMinLength,
      hasNumberOrSymbol,
      hasMixedCase,
      score,
      strengthLabel,
      strengthColor,
      textClass,
      matchesConfirm,
      hasConfirmMismatch,
    };
  }, [password, confirmPassword]);

  if (!password && !confirmPassword) {
    return null;
  }

  return (
    <div className="w-full space-y-2 pt-1 text-xs">
      {/* Compact Strength Bar */}
      {password ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-slate-500">Password strength</span>
            <span className={`font-semibold ${analysis.textClass}`}>
              {analysis.strengthLabel}
            </span>
          </div>
          <div className="flex h-1.5 w-full gap-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full flex-1 rounded-full transition-all duration-300 ${
                analysis.score >= 1 ? analysis.strengthColor : "bg-slate-200"
              }`}
            />
            <div
              className={`h-full flex-1 rounded-full transition-all duration-300 ${
                analysis.score >= 2 ? analysis.strengthColor : "bg-slate-200"
              }`}
            />
            <div
              className={`h-full flex-1 rounded-full transition-all duration-300 ${
                analysis.score >= 3 ? analysis.strengthColor : "bg-slate-200"
              }`}
            />
          </div>
        </div>
      ) : null}

      {/* Lightweight Requirements Checklist */}
      {showRules && password ? (
        <div className="grid grid-cols-1 gap-1.5 pt-1 text-slate-500 sm:grid-cols-3">
          <div className="flex items-center gap-1.5">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                analysis.hasMinLength
                  ? "bg-orange-100 text-orange-600"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              <Check className="h-2.5 w-2.5 stroke-[3]" />
            </span>
            <span
              className={`text-[11px] ${
                analysis.hasMinLength ? "text-slate-800 font-medium" : "text-slate-500"
              }`}
            >
              At least 8 characters
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                analysis.hasMixedCase
                  ? "bg-orange-100 text-orange-600"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              <Check className="h-2.5 w-2.5 stroke-[3]" />
            </span>
            <span
              className={`text-[11px] ${
                analysis.hasMixedCase ? "text-slate-800 font-medium" : "text-slate-500"
              }`}
            >
              Upper & lower case
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                analysis.hasNumberOrSymbol
                  ? "bg-orange-100 text-orange-600"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              <Check className="h-2.5 w-2.5 stroke-[3]" />
            </span>
            <span
              className={`text-[11px] ${
                analysis.hasNumberOrSymbol ? "text-slate-800 font-medium" : "text-slate-500"
              }`}
            >
              Number or symbol
            </span>
          </div>
        </div>
      ) : null}

      {/* Confirmation match row if confirm password is typed */}
      {confirmPassword !== undefined && confirmPassword.length > 0 && (
        <div className="pt-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                analysis.matchesConfirm
                  ? "bg-orange-100 text-orange-600"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {analysis.matchesConfirm ? (
                <Check className="h-2.5 w-2.5 stroke-[3]" />
              ) : (
                <X className="h-2.5 w-2.5 stroke-[3]" />
              )}
            </span>
            <span
              className={`text-[11px] font-medium ${
                analysis.matchesConfirm ? "text-slate-800" : "text-slate-600"
              }`}
            >
              {analysis.matchesConfirm
                ? "Passwords match"
                : "Passwords do not match"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
