import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRateLimitKeys,
  calculateAuthBackoffMs,
  formatRateLimitRetryDelay,
  getRateLimitPolicy,
} from "../src/lib/rate-limit";

test("rate-limit policy thresholds can be configured per endpoint group", () => {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.RATE_LIMIT_USER_MAX_REQUESTS;
  env.RATE_LIMIT_USER_MAX_REQUESTS = "37";

  try {
    assert.equal(getRateLimitPolicy("user").maxRequests, 37);
  } finally {
    env.RATE_LIMIT_USER_MAX_REQUESTS = previous;
  }
});

test("auth policy defaults to three requests per fifteen minutes", () => {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.RATE_LIMIT_AUTH_MAX_REQUESTS;
  delete env.RATE_LIMIT_AUTH_MAX_REQUESTS;

  try {
    assert.equal(getRateLimitPolicy("auth").maxRequests, 3);
    assert.equal(getRateLimitPolicy("auth").windowMs, 15 * 60 * 1000);
  } finally {
    env.RATE_LIMIT_AUTH_MAX_REQUESTS = previous;
  }
});

test("auth rate-limit keys combine opaque account and client IP identities", () => {
  const env = process.env as Record<string, string | undefined>;
  const previousTrust = env.RATE_LIMIT_TRUST_PROXY_HEADERS;
  env.RATE_LIMIT_TRUST_PROXY_HEADERS = "true";
  const request = new Request("https://example.com/api/auth/login", {
    headers: { "x-real-ip": "203.0.113.9" },
  });

  try {
    const keys = buildRateLimitKeys(request, "auth:login", {
      group: "auth",
      email: "Person@Example.com",
    });

    assert.equal(keys.length, 2);
    assert.ok(keys.some((key) => key.startsWith("auth:login:account:")));
    assert.ok(keys.some((key) => key.startsWith("auth:login:ip:")));
    assert.ok(keys.every((key) => !key.includes("person@example.com") && !key.includes("203.0.113.9")));
  } finally {
    env.RATE_LIMIT_TRUST_PROXY_HEADERS = previousTrust;
  }
});

test("public rate-limit keys use client IP when available and route fallback otherwise", () => {
  const env = process.env as Record<string, string | undefined>;
  const previousTrust = env.RATE_LIMIT_TRUST_PROXY_HEADERS;
  env.RATE_LIMIT_TRUST_PROXY_HEADERS = "true";
  const request = new Request("https://example.com/api/public/products", {
    headers: { "x-real-ip": "203.0.113.10" },
  });
  const noIpRequest = new Request("https://example.com/api/public/products");

  try {
    assert.match(buildRateLimitKeys(request, "public:products")[0], /^public:products:ip:/);
    assert.deepEqual(buildRateLimitKeys(noIpRequest, "public:products"), ["public:products:global"]);
  } finally {
    env.RATE_LIMIT_TRUST_PROXY_HEADERS = previousTrust;
  }
});

test("auth backoff doubles by failure and is capped by policy", () => {
  const policy = {
    ...getRateLimitPolicy("auth"),
    maxRequests: 3,
    backoffBaseMs: 1_000,
    backoffMaxMs: 4_000,
  };

  assert.equal(calculateAuthBackoffMs(3, policy), 1_000);
  assert.equal(calculateAuthBackoffMs(4, policy), 2_000);
  assert.equal(calculateAuthBackoffMs(5, policy), 4_000);
  assert.equal(calculateAuthBackoffMs(20, policy), 4_000);
});

test("formats a short retry delay in seconds", () => {
  assert.equal(formatRateLimitRetryDelay(30), "30 seconds");
});

test("formats minute retries without a malformed clock-like string", () => {
  assert.equal(formatRateLimitRetryDelay(90), "1 minute");
  assert.equal(formatRateLimitRetryDelay(150), "2 minutes");
});

test("formats long retries with hours and minutes", () => {
  assert.equal(formatRateLimitRetryDelay(3661), "1 hour and 1 minute");
});
