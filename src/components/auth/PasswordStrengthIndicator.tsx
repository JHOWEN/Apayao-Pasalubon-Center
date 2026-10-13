"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";
import {
  getNewPasswordPolicyChecks,
  getNewPasswordPolicyError,
  MAX_BCRYPT_PASSWORD_BYTES,
  MIN_NEW_PASSWORD_CHARACTERS,
} from "@/lib/password-policy";

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
    const checks = getNewPasswordPolicyChecks(password);
    const policyError = password ? getNewPasswordPolicyError(password) : null;

    const matchesConfirm =
      confirmPassword !== undefined &&
      confirmPassword.length > 0 &&
      password === confirmPassword;

    const hasConfirmMismatch =
      confirmPassword !== undefined &&
      confirmPassword.length > 0 &&
      password !== confirmPassword;

    return {
      ...checks,
      policyError,
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
        <p
          className={`text-xs font-semibold ${
            analysis.policyError ? "text-amber-700" : "text-emerald-700"
          }`}
          aria-live="polite"
        >
          {analysis.policyError ? "Password requirements not met" : "Password requirements met"}
        </p>
      ) : null}

      {/* Lightweight Requirements Checklist */}
      {showRules && password ? (
        <div className="grid grid-cols-1 gap-1.5 pt-1 text-slate-500 sm:grid-cols-2">
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
              At least {MIN_NEW_PASSWORD_CHARACTERS} characters
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                analysis.withinByteLimit
                  ? "bg-orange-100 text-orange-600"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              <Check className="h-2.5 w-2.5 stroke-[3]" />
            </span>
            <span
              className={`text-[11px] ${
                analysis.withinByteLimit ? "text-slate-800 font-medium" : "text-slate-500"
              }`}
            >
              Maximum {MAX_BCRYPT_PASSWORD_BYTES} UTF-8 bytes
            </span>
          </div>
          {([
            ["hasLowercase", "One lowercase letter"],
            ["hasUppercase", "One uppercase letter"],
            ["hasNumber", "One number"],
            ["hasSymbol", "One symbol"],
          ] as const).map(([check, label]) => (
            <div key={check} className="flex items-center gap-1.5">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  analysis[check]
                    ? "bg-orange-100 text-orange-600"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                <Check className="h-2.5 w-2.5 stroke-[3]" />
              </span>
              <span
                className={`text-[11px] ${
                  analysis[check] ? "text-slate-800 font-medium" : "text-slate-500"
                }`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {showRules && password ? (
        <p className="text-[11px] text-slate-600">
          Include uppercase and lowercase letters, a number, and a symbol. Spaces do not count as symbols.
        </p>
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
