import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getAppBaseUrl } from "@/lib/app-url";

function getVerificationSecret() {
  const configuredSecret = process.env.EMAIL_VERIFICATION_SECRET?.trim();
  if (configuredSecret) return configuredSecret;
  return process.env.NODE_ENV === "production" ? null : "dev-email-verification-secret";
}

export function createEmailVerificationToken(email: string) {
  const secret = getVerificationSecret();
  if (!secret) throw new Error("EMAIL_VERIFICATION_SECRET must be configured in production.");

  const randomPart = randomBytes(16).toString("hex");
  const payload = `${email.toLowerCase()}:${randomPart}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyEmailVerificationToken(email: string, token: string) {
  if (!email || !token) return false;

  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex <= 0) return false;

  const payload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);

  if (!payload || !signature) return false;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;

  const secret = getVerificationSecret();
  if (!secret) return false;
  const expectedSignature = createHmac("sha256", secret).update(payload).digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");
  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) return false;

  const [storedEmail] = payload.split(":");
  return storedEmail.toLowerCase() === email.toLowerCase();
}

export function buildEmailVerificationUrl(email: string, token: string, baseUrl?: string) {
  const resolvedBaseUrl = getAppBaseUrl(baseUrl);
  return `${resolvedBaseUrl}/api/auth/verify-email?email=${encodeURIComponent(email.toLowerCase())}&token=${encodeURIComponent(token)}`;
}
