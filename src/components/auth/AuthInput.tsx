"use client";

import { forwardRef, ComponentType, InputHTMLAttributes } from "react";

export interface AuthInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  id: string;
  label: string;
  hideLabel?: boolean;
  icon?: ComponentType<{ className?: string }>;
  error?: string;
  hint?: string;
  rightAdornment?: React.ReactNode;
}

export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(
  (
    {
      id,
      label,
      hideLabel = false,
      type = "text",
      icon: Icon,
      error,
      hint,
      className = "",
      required,
      disabled,
      rightAdornment,
      placeholder,
      ...props
    },
    ref
  ) => {
    const isPasswordType = type === "password";

    return (
      <div className="w-full">
        {!hideLabel && (
          <div className="mb-2 flex items-center justify-between gap-2">
            <label
              htmlFor={id}
              className="block text-[13px] font-medium tracking-[-0.01em] text-slate-700"
            >
              {label}
              {required && <span className="ml-1 text-slate-900">*</span>}
            </label>
            {hint && !error && (
              <span className="text-xs text-slate-500">{hint}</span>
            )}
          </div>
        )}

        <div className="group relative flex w-full items-center">
          {Icon && (
            <div className="pointer-events-none absolute left-4 flex items-center justify-center text-slate-500 transition-colors duration-200 group-focus-within:text-slate-800">
              <Icon className="h-4.5 w-4.5" aria-hidden="true" />
            </div>
          )}

          <input
            ref={ref}
            id={id}
            type={type}
            required={required}
            disabled={disabled}
            aria-label={label}
            placeholder={placeholder ?? label}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error ? `${id}-error` : hint ? `${id}-hint` : undefined
            }
            className={`w-full h-[48px] min-h-[48px] rounded-xl border bg-white px-4 py-3 text-sm text-slate-900 font-medium shadow-[inset_0_1px_0_rgba(15,23,42,0.02)] transition-all duration-200 placeholder:text-slate-400 outline-none ring-0
              ${Icon ? "pl-11" : "pl-4"}
              ${isPasswordType || rightAdornment ? "pr-4" : "pr-4"}
              ${
                error
                  ? "border-orange-300 bg-orange-50 focus:border-orange-500"
                  : "border-slate-300 hover:border-slate-400 focus:border-slate-900"
              }
              ${disabled ? "cursor-not-allowed bg-slate-100 opacity-70" : ""}
              ${className}
            `}
            {...props}
          />

          {!isPasswordType && rightAdornment && (
            <div className="absolute right-3.5 flex items-center">
              {rightAdornment}
            </div>
          )}
        </div>

        {error && (
          <p
            id={`${id}-error`}
            role="alert"
            className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-orange-600"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

AuthInput.displayName = "AuthInput";
