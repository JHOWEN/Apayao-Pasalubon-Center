import { fetchWithTimeout } from "@/lib/client-fetch";

type CheckoutData = {
  user: {
    id: string;
    name?: string;
    phone?: string | null;
    address?: string | null;
    role?: string;
    emailVerified?: boolean;
    isBlocked?: boolean;
  } | null;
  settings: {
    gcashAccountName?: string | null;
    gcashAccountNumber?: string | null;
    gcashQrCodeUrl?: string | null;
    mayaAccountName?: string | null;
    mayaAccountNumber?: string | null;
    mayaQrCodeUrl?: string | null;
  };
};

let cachedRequest: { promise: Promise<CheckoutData>; expiresAt: number } | null = null;

export function getCheckoutData() {
  if (cachedRequest && cachedRequest.expiresAt > Date.now()) return cachedRequest.promise;

  const promise = fetchWithTimeout("/api/auth/checkout-data").then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error("Unable to load checkout details.");
    return data as CheckoutData;
  });

  cachedRequest = { promise, expiresAt: Date.now() + 30_000 };
  void promise.catch(() => {
    if (cachedRequest?.promise === promise) cachedRequest = null;
  });

  return promise;
}

export function prefetchCheckoutData() {
  void getCheckoutData().catch(() => undefined);
}