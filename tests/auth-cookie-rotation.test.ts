import assert from "node:assert/strict";
import test from "node:test";
import { getUserFacingErrorMessage } from "../src/lib/api-response";
import { canAccessAdminPortal } from "../src/lib/auth";
import { getAuthCookieOptions, getRefreshCookieOptions } from "../src/lib/cookies";
import { signAccessToken, verifyAccessToken } from "../src/lib/auth-sessions";
import { buildEmailVerificationUrl, createEmailVerificationToken, verifyEmailVerificationToken } from "../src/lib/email-verification";
import { buildPasswordResetUrl, createPasswordResetToken, verifyPasswordResetToken } from "../src/lib/password-reset";

test("auth cookie options always include the required session security flags", () => {
  const expectedSecureValue = process.env.NODE_ENV === "production";

  const defaults = getAuthCookieOptions();
  assert.equal(defaults.httpOnly, true);
  assert.equal(defaults.secure, expectedSecureValue);
  assert.equal(defaults.sameSite, "lax");
  assert.equal(defaults.path, "/");
  assert.equal(defaults.maxAge, 10 * 60);

  const refresh = getRefreshCookieOptions(new Date("2026-10-12T00:00:00Z"));
  assert.equal(refresh.httpOnly, true);
  assert.equal(refresh.secure, expectedSecureValue);
  assert.equal(refresh.sameSite, "lax");
  assert.equal(refresh.path, "/api/auth");
});

test("access JWTs carry a session id, token id, version, and ten-minute expiry", () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-only-secret-that-is-long-enough-for-the-suite";

  try {
    const before = Math.floor(Date.now() / 1000);
    const token = signAccessToken("test-user", "test-session", 3);
    const claims = verifyAccessToken(token);

    assert.equal(claims?.sub, "test-user");
    assert.equal(claims?.sid, "test-session");
    assert.equal(claims?.ver, 3);
    assert.ok(claims?.jti);
    assert.ok(claims?.exp && claims.exp >= before + 600 && claims.exp <= before + 601);
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test("access JWT verification requires a valid HS256 signature", () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-only-secret-that-is-long-enough-for-the-suite";

  try {
    const token = signAccessToken("test-user", "test-session", 0);
    assert.equal(verifyAccessToken(token)?.sub, "test-user");
    assert.equal(verifyAccessToken(`${token}.tampered`), null);
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test("JWT signing fails closed when production secret is missing", () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;
  delete process.env.JWT_SECRET;
  Reflect.set(process.env, "NODE_ENV", "production");

  try {
    assert.equal(verifyAccessToken("header.payload.signature"), null);
    assert.throws(() => signAccessToken("test-user", "test-session", 0), /JWT_SECRET must be configured/);
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", originalNodeEnv);
  }
});

test("admin portal role policy excludes customers", () => {
  assert.equal(canAccessAdminPortal("ADMIN"), true);
  assert.equal(canAccessAdminPortal("STAFF"), true);
  assert.equal(canAccessAdminPortal("CUSTOMER"), false);
  assert.equal(canAccessAdminPortal(undefined), false);
});

test("email verification and reset links use the canonical configured origin", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalEmailSecret = process.env.EMAIL_VERIFICATION_SECRET;
  const originalResetSecret = process.env.PASSWORD_RESET_SECRET;
  process.env.NEXT_PUBLIC_APP_URL = "https://apc.example.test/path";
  process.env.EMAIL_VERIFICATION_SECRET = "email-test-secret";
  process.env.PASSWORD_RESET_SECRET = "reset-test-secret";

  try {
    const emailToken = createEmailVerificationToken("person@example.test");
    const resetToken = createPasswordResetToken("person@example.test");
    assert.equal(verifyEmailVerificationToken("person@example.test", emailToken), true);
    assert.equal(verifyEmailVerificationToken("person@example.test", `${emailToken}x`), false);
    assert.equal(verifyPasswordResetToken("person@example.test", resetToken), true);
    assert.equal(verifyPasswordResetToken("person@example.test", `${resetToken}x`), false);
    assert.match(buildEmailVerificationUrl("person@example.test", emailToken), /^https:\/\/apc\.example\.test\//);
    assert.match(buildPasswordResetUrl("person@example.test", resetToken), /^https:\/\/apc\.example\.test\//);
  } finally {
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    if (originalEmailSecret === undefined) delete process.env.EMAIL_VERIFICATION_SECRET;
    else process.env.EMAIL_VERIFICATION_SECRET = originalEmailSecret;
    if (originalResetSecret === undefined) delete process.env.PASSWORD_RESET_SECRET;
    else process.env.PASSWORD_RESET_SECRET = originalResetSecret;
  }
});

test("maps network and server failures to a friendly user-facing message", () => {
  assert.equal(
    getUserFacingErrorMessage("ECONNREFUSED: connection refused at java.net.ConnectionExceptions"),
    "We're having trouble connecting to our servers. Please check your internet connection and try refreshing the page.",
  );

  assert.equal(
    getUserFacingErrorMessage("Internal Server Error"),
    "We're having trouble processing your request right now. Please try again in a moment.",
  );

  assert.equal(
    getUserFacingErrorMessage("Database unavailable"),
    "We're having trouble processing your request right now. Please try again in a moment.",
  );
});
