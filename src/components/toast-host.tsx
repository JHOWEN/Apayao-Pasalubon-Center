"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminToast, type AdminToastType } from "@/components/admin/admin-toast";

type ToastPayload = {
  type: AdminToastType;
  message: string;
  title?: string;
  duration?: number;
};

export function ToastHost() {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const payload = (event as CustomEvent<ToastPayload>).detail;
      if (payload?.message) setToast(payload);
    };

    window.addEventListener("apc-toast", handleToast);
    return () => window.removeEventListener("apc-toast", handleToast);
  }, []);

  if (!toast) return null;

  return (
    <AdminToast
      type={toast.type}
      message={toast.message}
      title={toast.title}
      duration={toast.duration ?? 5000}
      placement="top-center"
      onDismiss={dismissToast}
    />
  );
}
