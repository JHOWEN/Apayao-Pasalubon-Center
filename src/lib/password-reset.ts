import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getAppBaseUrl } from "@/lib/app-url";

function getResetSecret() {
  const configuredSecret = process.env.PASSWORD_RESET_SECRET?.trim();
  if (configuredSecret) return configuredSecret;

  const fallbackMasterSecret =
    process.env.EMAIL_VERIFICATION_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (fallbackMasterSecret) {
    return createHmac("sha256", fallbackMasterSecret)
      .update("apc:password-reset:v1")
      .digest("hex");
  }

  return process.env.NODE_ENV === "production" ? null : "dev-password-reset-secret";
}

export function createPasswordResetToken(email: string) {
  const secret = getResetSecret();
  if (!secret) {
    throw new Error(
      "Configure PASSWORD_RESET_SECRET, EMAIL_VERIFICATION_SECRET, or JWT_SECRET in production.",
    );
  }

  const randomPart = randomBytes(16).toString("hex");
  const payload = `${email.toLowerCase()}:${randomPart}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyPasswordResetToken(email: string, token: string) {
  if (!email || !token) return false;

  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex <= 0) return false;

  const payload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  if (!payload || !signature) return false;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;

  const secret = getResetSecret();
  if (!secret) return false;
  const expectedSignature = createHmac("sha256", secret).update(payload).digest("hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");
  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) return false;

  const [storedEmail] = payload.split(":");
  return storedEmail.toLowerCase() === email.toLowerCase();
}

export function buildPasswordResetUrl(email: string, token: string, baseUrl?: string) {
  const resolvedBaseUrl = getAppBaseUrl(baseUrl);
  return `${resolvedBaseUrl}/reset-password?email=${encodeURIComponent(email.toLowerCase())}&token=${encodeURIComponent(token)}`;
}
