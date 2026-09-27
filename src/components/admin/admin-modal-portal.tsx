"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

export function AdminModalPortal({ children }: { children: ReactNode }) {
  const isMounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  return isMounted ? createPortal(children, document.body) : null;
}
