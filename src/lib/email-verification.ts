import { createHmac, randomBytes } from "crypto";

const verificationSecret = process.env.EMAIL_VERIFICATION_SECRET || "dev-email-verification-secret";

export function createEmailVerificationToken(email: string) {
  const randomPart = randomBytes(16).toString("hex");
  const payload = `${email.toLowerCase()}:${randomPart}`;
  const signature = createHmac("sha256", verificationSecret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyEmailVerificationToken(email: string, token: string) {
  if (!email || !token) return false;

  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex <= 0) return false;

  const payload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);

  if (!payload || !signature) return false;

  const expectedSignature = createHmac("sha256", verificationSecret).update(payload).digest("hex");

  if (expectedSignature !== signature) return false;

  const [storedEmail] = payload.split(":");
  return storedEmail.toLowerCase() === email.toLowerCase();
}

export function buildEmailVerificationUrl(email: string, token: string, baseUrl?: string) {
  const resolvedBaseUrl = (baseUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${resolvedBaseUrl}/api/auth/verify-email?email=${encodeURIComponent(email.toLowerCase())}&token=${encodeURIComponent(token)}`;
}
