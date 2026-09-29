import test from "node:test";
import assert from "node:assert/strict";

import { buildRateLimitKeys, enforceRateLimit } from "../src/lib/rate-limit";

test("public storefront reads use trusted client IP keys and fall back to a route key otherwise", () => {
  const firstRequest = new Request("https://example.com/api/public/products", {
    headers: {
      "x-forwarded-for": "203.0.113.10, 10.0.0.5",
      "x-real-ip": "203.0.113.10",
    },
  });
  const secondRequest = new Request("https://example.com/api/public/products", {
    headers: { "x-real-ip": "198.51.100.42" },
  });
  const env = process.env as Record<string, string | undefined>;
  const previousTrust = env.RATE_LIMIT_TRUST_PROXY_HEADERS;

  try {
    env.RATE_LIMIT_TRUST_PROXY_HEADERS = "false";
    assert.deepEqual(buildRateLimitKeys(firstRequest, "public:products"), ["public:products:global"]);

    env.RATE_LIMIT_TRUST_PROXY_HEADERS = "true";
    const firstKeys = buildRateLimitKeys(firstRequest, "public:products");
    const secondKeys = buildRateLimitKeys(secondRequest, "public:products");
    assert.match(firstKeys[0], /^public:products:ip:/);
    assert.match(secondKeys[0], /^public:products:ip:/);
    assert.notEqual(firstKeys[0], secondKeys[0]);
  } finally {
    env.RATE_LIMIT_TRUST_PROXY_HEADERS = previousTrust;
  }
});

test("localhost storefront requests bypass rate limiting during development", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previousEnv = env.NODE_ENV;
  env.NODE_ENV = "development";

  try {
    const request = new Request("http://localhost:3000/api/public/products");

    for (let i = 0; i < 10; i += 1) {
      const response = await enforceRateLimit(request, "public:products", {
        group: "public",
      });
      assert.equal(response, null);
    }
  } finally {
    env.NODE_ENV = previousEnv;
  }
});
