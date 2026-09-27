import assert from "node:assert/strict";
import test from "node:test";
import { getUserFacingErrorMessage } from "../src/lib/api-response";
import { getAuthCookieOptions } from "../src/lib/cookies";

test("auth cookie options always include the required session security flags", () => {
  const expectedSecureValue = process.env.NODE_ENV === "production";

  const defaults = getAuthCookieOptions();
  assert.equal(defaults.httpOnly, true);
  assert.equal(defaults.secure, expectedSecureValue);
  assert.equal(defaults.sameSite, "lax");
  assert.equal(defaults.path, "/");
  assert.equal(defaults.maxAge, 60 * 60 * 24 * 7);

  const rememberMe = getAuthCookieOptions(true);
  assert.equal(rememberMe.maxAge, 60 * 60 * 24 * 30);
  assert.equal(rememberMe.secure, expectedSecureValue);
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
