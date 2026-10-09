import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { canAccessAdminPortal, getUserForToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RateLimitEntry = {
  count: number;
  resetAt: number;
  blockedUntil: number | null;
};

export type RateLimitGroup = "auth" | "public" | "user" | "admin";

export type RateLimitPolicy = {
  group: RateLimitGroup;
  maxRequests: number;
  windowMs: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
};

export type RateLimitKeyOptions = {
  group?: RateLimitGroup;
  email?: string;
  accountId?: string;
};

const rateLimitEntries = new Map<string, RateLimitEntry>();
const redisKeyPrefix = "apc:rate-limit:v2:";
const redisCheckScript = `
local blockedKey = KEYS[1] .. ':blocked'
local countKey = KEYS[1] .. ':count'
local nowMs = tonumber(ARGV[5])
local blockedUntil = tonumber(redis.call('GET', blockedKey) or '0')
if blockedUntil > nowMs then
  return { 0, math.ceil((blockedUntil - nowMs) / 1000) }
end
if blockedUntil > 0 then
  redis.call('DEL', blockedKey)
end

local maxRequests = tonumber(ARGV[1])
local windowSeconds = tonumber(ARGV[2])
local backoffBaseMs = tonumber(ARGV[3])
local backoffMaxMs = tonumber(ARGV[4])
local isAuth = ARGV[6] == '1'
local count = redis.call('INCR', countKey)
if count == 1 then
  local countTtl = windowSeconds
  if isAuth then
    countTtl = countTtl + math.ceil(backoffMaxMs / 1000)
  end
  redis.call('EXPIRE', countKey, countTtl)
end

if count > maxRequests then
  local delayMs
  if isAuth then
    local exponent = math.min(count - maxRequests - 1, 30)
    delayMs = math.min(backoffBaseMs * (2 ^ exponent), backoffMaxMs)
  else
    local remainingMs = redis.call('PTTL', countKey)
    delayMs = remainingMs > 0 and remainingMs or (windowSeconds * 1000)
  end
  local nextBlockedUntil = nowMs + delayMs
  redis.call('SET', blockedKey, nextBlockedUntil, 'PX', delayMs)
  return { 0, math.max(1, math.ceil(delayMs / 1000)) }
end

return { 1, 0 }
`;

const defaultPolicies: Record<RateLimitGroup, Omit<RateLimitPolicy, "group">> = {
  auth: { maxRequests: 3, windowMs: 15 * 60 * 1000, backoffBaseMs: 30 * 1000, backoffMaxMs: 15 * 60 * 1000 },
  public: { maxRequests: 300, windowMs: 60 * 1000, backoffBaseMs: 0, backoffMaxMs: 0 },
  user: { maxRequests: 120, windowMs: 60 * 1000, backoffBaseMs: 0, backoffMaxMs: 0 },
  admin: { maxRequests: 180, windowMs: 60 * 1000, backoffBaseMs: 0, backoffMaxMs: 0 },
};

function getPositiveIntegerSetting(name: string, fallback: number, maximum = 2_592_000_000) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : fallback;
}

export function getRateLimitPolicy(group: RateLimitGroup): RateLimitPolicy {
  const defaults = defaultPolicies[group];
  const prefix = `RATE_LIMIT_${group.toUpperCase()}`;
  const policy = {
    group,
    maxRequests: getPositiveIntegerSetting(`${prefix}_MAX_REQUESTS`, defaults.maxRequests, 1_000_000),
    windowMs: getPositiveIntegerSetting(`${prefix}_WINDOW_MS`, defaults.windowMs),
    backoffBaseMs: group === "auth"
      ? getPositiveIntegerSetting(`${prefix}_BACKOFF_BASE_MS`, defaults.backoffBaseMs)
      : 0,
    backoffMaxMs: group === "auth"
      ? getPositiveIntegerSetting(`${prefix}_BACKOFF_MAX_MS`, defaults.backoffMaxMs)
      : 0,
  };

  if (group === "auth" && policy.backoffMaxMs < policy.backoffBaseMs) {
    policy.backoffMaxMs = policy.backoffBaseMs;
  }

  return policy;
}

export function calculateAuthBackoffMs(attemptCount: number, policy: RateLimitPolicy) {
  if (policy.group !== "auth" || attemptCount <= policy.maxRequests) return 0;
  const exponent = Math.min(attemptCount - policy.maxRequests - 1, 30);
  return Math.min(policy.backoffBaseMs * (2 ** exponent), policy.backoffMaxMs);
}

function inferRateLimitGroup(route: string): RateLimitGroup {
  const normalizedRoute = normalizeKey(route);
  if (normalizedRoute.startsWith("auth:")) return "auth";
  if (normalizedRoute.startsWith("public:")) return "public";
  if (normalizedRoute.startsWith("admin:")) return "admin";
  return "user";
}

let redisClient: Redis | null | undefined;

function getRedisClient() {
  if (typeof redisClient !== "undefined") return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  redisClient = url && token ? new Redis({ url, token }) : null;
  return redisClient;
}

function getRedisKey(key: string) {
  return `${redisKeyPrefix}${normalizeKey(key)}`;
}

function normalizeKey(key: string) {
  return key.trim().toLowerCase();
}

function getClientIp(request: Request) {
  if (process.env.RATE_LIMIT_TRUST_PROXY_HEADERS !== "true") return null;

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp)) return realIp;

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor && isIP(forwardedFor) ? forwardedFor : null;
}

function hashIdentity(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export function buildRateLimitKeys(
  request: Request,
  route: string,
  options: RateLimitKeyOptions = {},
) {
  const normalizedRoute = normalizeKey(route);
  const group = options.group ?? inferRateLimitGroup(normalizedRoute);
  const clientIp = getClientIp(request);
  const result: string[] = [];

  if (group === "public") {
    return [clientIp ? `${normalizedRoute}:ip:${hashIdentity(clientIp)}` : `${normalizedRoute}:global`];
  }

  const accountIdentity = options.accountId?.trim() || options.email?.trim();
  if (accountIdentity) {
    result.push(`${normalizedRoute}:account:${hashIdentity(accountIdentity)}`);
  }
  if (clientIp) {
    result.push(`${normalizedRoute}:ip:${hashIdentity(clientIp)}`);
  }

  if (!result.length) {
    result.push(`${normalizedRoute}:global`);
  }

  return result;
}

function cleanupExpiredEntries(now: number) {
  for (const [key, entry] of rateLimitEntries.entries()) {
    if (entry.resetAt <= now && (!entry.blockedUntil || entry.blockedUntil <= now)) {
      rateLimitEntries.delete(key);
      continue;
    }

    if (entry.blockedUntil && entry.blockedUntil <= now) {
      entry.blockedUntil = null;
    }
  }
}

async function getDatabaseRateLimitStatus(keys: string[]) {
  const now = Date.now();
  cleanupExpiredEntries(now);

  try {
    const entries = await prisma.rateLimitEntry.findMany({
      where: { key: { in: keys.map(normalizeKey) } },
      select: { blockedUntil: true },
    });
    const blockedUntil = entries
      .map((entry) => entry.blockedUntil?.getTime() ?? 0)
      .find((value) => value > now);

    if (blockedUntil) {
      return { allowed: false, retryAfterSeconds: Math.ceil((blockedUntil - now) / 1000) };
    }

    return { allowed: true, retryAfterSeconds: null };
  } catch {
    return getLocalRateLimitStatus(keys);
  }
}

function getLocalRateLimitStatus(keys: string[]) {
  const now = Date.now();
  cleanupExpiredEntries(now);

  for (const key of keys.map(normalizeKey)) {
    const entry = rateLimitEntries.get(key);
    if (entry?.blockedUntil && entry.blockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000),
      };
    }
  }

  return { allowed: true, retryAfterSeconds: null };
}

async function checkDatabaseRateLimit(keys: string[], policy: RateLimitPolicy) {
  const now = Date.now();
  cleanupExpiredEntries(now);

  const normalizedKeys = keys.map(normalizeKey);

  try {
    return await prisma.$transaction(async (tx) => {
      let blockedRetryAfter = 0;

      const entries: Array<{ key: string; entry: { count: number; resetAt: Date; blockedUntil: Date | null } }> = [];

      for (const key of normalizedKeys) {
        await tx.$executeRaw`
          INSERT INTO "RateLimitEntry" ("key", "count", "resetAt", "blockedUntil", "updatedAt")
          VALUES (${key}, 0, ${new Date(0)}, NULL, NOW())
          ON CONFLICT ("key") DO NOTHING
        `;

        const rows = await tx.$queryRaw<Array<{ count: number; resetAt: Date; blockedUntil: Date | null }>>`
          SELECT "count", "resetAt", "blockedUntil"
          FROM "RateLimitEntry"
          WHERE "key" = ${key}
          FOR UPDATE
        `;
        const entry = rows[0];
        const currentTime = Date.now();

        if (entry.blockedUntil && entry.blockedUntil.getTime() > currentTime) {
          blockedRetryAfter = Math.max(blockedRetryAfter, Math.ceil((entry.blockedUntil.getTime() - currentTime) / 1000));
        }

        entries.push({ key, entry });
      }

      if (blockedRetryAfter > 0) {
        return { allowed: false, retryAfterSeconds: blockedRetryAfter };
      }

      for (const { key, entry } of entries) {
        const currentTime = Date.now();

        const isExpired = entry.resetAt.getTime() <= currentTime;
        const nextCount = isExpired ? 1 : entry.count + 1;
        let nextResetAt = isExpired ? new Date(currentTime + policy.windowMs) : entry.resetAt;
        let nextBlockedUntil: Date | null = null;

        if (nextCount > policy.maxRequests) {
          const delayMs = policy.group === "auth"
            ? calculateAuthBackoffMs(nextCount, policy)
            : Math.max(1_000, nextResetAt.getTime() - currentTime);
          nextBlockedUntil = new Date(currentTime + delayMs);
          if (nextBlockedUntil > nextResetAt) {
            nextResetAt = nextBlockedUntil;
          }
          blockedRetryAfter = Math.max(blockedRetryAfter, Math.ceil(delayMs / 1000));
        }

        await tx.$executeRaw`
          UPDATE "RateLimitEntry"
          SET "count" = ${nextCount}, "resetAt" = ${nextResetAt}, "blockedUntil" = ${nextBlockedUntil}, "updatedAt" = NOW()
          WHERE "key" = ${key}
        `;

      }

      return blockedRetryAfter > 0
        ? { allowed: false, retryAfterSeconds: blockedRetryAfter }
        : { allowed: true, retryAfterSeconds: null };
    }, { isolationLevel: "Serializable" });
  } catch {
    return checkLocalRateLimit(normalizedKeys, policy);
  }
}

function checkLocalRateLimit(normalizedKeys: string[], policy: RateLimitPolicy) {
  const now = Date.now();
  cleanupExpiredEntries(now);

  for (const key of normalizedKeys) {
    const entry = rateLimitEntries.get(key);
    if (entry?.blockedUntil && entry.blockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000),
      };
    }
  }

  let retryAfterSeconds = 0;

  for (const key of normalizedKeys) {
    const existingEntry = rateLimitEntries.get(key);

    if (!existingEntry || existingEntry.resetAt <= now) {
      const nextEntry: RateLimitEntry = {
        count: 1,
        resetAt: now + policy.windowMs,
        blockedUntil: null,
      };
      if (nextEntry.count > policy.maxRequests) {
        const delayMs = policy.group === "auth"
          ? calculateAuthBackoffMs(nextEntry.count, policy)
          : policy.windowMs;
        nextEntry.blockedUntil = now + delayMs;
        nextEntry.resetAt = Math.max(nextEntry.resetAt, nextEntry.blockedUntil);
        retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil(delayMs / 1000));
      }
      rateLimitEntries.set(key, nextEntry);
      continue;
    }

    existingEntry.count += 1;

    if (existingEntry.count > policy.maxRequests) {
      const delayMs = policy.group === "auth"
        ? calculateAuthBackoffMs(existingEntry.count, policy)
        : Math.max(1_000, existingEntry.resetAt - now);
      existingEntry.blockedUntil = now + delayMs;
      existingEntry.resetAt = Math.max(existingEntry.resetAt, existingEntry.blockedUntil);
      retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil(delayMs / 1000));
    }

    rateLimitEntries.set(key, existingEntry);
  }

  if (retryAfterSeconds > 0) {
    return {
      allowed: false,
      retryAfterSeconds,
    };
  }

  return { allowed: true, retryAfterSeconds: null };
}

async function resetDatabaseRateLimit(keys: string[]) {
  try {
    await prisma.rateLimitEntry.deleteMany({ where: { key: { in: keys.map(normalizeKey) } } });
  } catch {
    // Fall back to the local limiter when the shared store is unavailable.
  }

  for (const key of keys.map(normalizeKey)) {
    rateLimitEntries.delete(key);
  }
}

export async function getRateLimitStatus(keys: string[]) {
  const redis = getRedisClient();
  if (!redis) return getDatabaseRateLimitStatus(keys);

  try {
    const blockedUntilValues = await Promise.all(
      keys.map((key) => redis.get<string | number>(`${getRedisKey(key)}:blocked`)),
    );
    const now = Date.now();
    const retryAfterSeconds = blockedUntilValues.reduce<number>((maximum, value) => {
      const blockedUntil = Number(value ?? 0);
      return blockedUntil > now
        ? Math.max(maximum, Math.ceil((blockedUntil - now) / 1000))
        : maximum;
    }, 0);

    return retryAfterSeconds
      ? { allowed: false, retryAfterSeconds }
      : { allowed: true, retryAfterSeconds: null };
  } catch {
    return getDatabaseRateLimitStatus(keys);
  }
}

export async function checkRateLimit(keys: string[], policy: RateLimitPolicy) {
  const redis = getRedisClient();
  if (!redis) return checkDatabaseRateLimit(keys, policy);

  try {
    const status = await getRateLimitStatus(keys);
    if (!status.allowed) return status;

    const windowSeconds = Math.max(1, Math.ceil(policy.windowMs / 1000));
    let retryAfterSeconds = 0;

    for (const key of keys) {
      const result = (await redis.eval(
        redisCheckScript,
        [getRedisKey(key)],
        [
          String(policy.maxRequests),
          String(windowSeconds),
          String(policy.backoffBaseMs),
          String(policy.backoffMaxMs),
          String(Date.now()),
          policy.group === "auth" ? "1" : "0",
        ],
      )) as unknown[];
      const allowed = Number(result[0]) === 1;

      if (!allowed) {
        retryAfterSeconds = Math.max(retryAfterSeconds, Number(result[1]) || 1);
        break;
      }
    }

    return retryAfterSeconds > 0
      ? { allowed: false, retryAfterSeconds }
      : { allowed: true, retryAfterSeconds: null };
  } catch {
    return checkDatabaseRateLimit(keys, policy);
  }
}

export async function resetRateLimit(keys: string[]) {
  const redis = getRedisClient();
  if (!redis) return resetDatabaseRateLimit(keys);

  try {
    await Promise.all(
      keys.flatMap((key) => {
        const redisKey = getRedisKey(key);
        return [redis.del(`${redisKey}:count`), redis.del(`${redisKey}:blocked`)];
      }),
    );

    for (const key of keys.map(normalizeKey)) {
      rateLimitEntries.delete(key);
    }
  } catch {
    await resetDatabaseRateLimit(keys);
  }
}

export async function checkLoginRateLimit(request: Request, email: string) {
  const policy = getRateLimitPolicy("auth");
  const keys = buildRateLimitKeys(request, "auth:login", { group: "auth", email });
  return checkRateLimit(keys, policy);
}

export async function getLoginRateLimitStatus(request: Request, email: string) {
  const keys = buildRateLimitKeys(request, "auth:login", { group: "auth", email });
  return getRateLimitStatus(keys);
}

export async function resetLoginRateLimit(request: Request, email: string) {
  const accountKey = buildRateLimitKeys(request, "auth:login", { group: "auth", email })
    .filter((key) => key.includes(":account:"));
  await resetRateLimit(accountKey);
}

export function formatRateLimitRetryDelay(seconds: number) {
  const safeSeconds = Math.max(1, Math.ceil(seconds));

  if (safeSeconds < 60) {
    return `${safeSeconds} second${safeSeconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  return `${hours} hour${hours === 1 ? "" : "s"} and ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}`;
}

function shouldBypassRateLimitForLocalhost(request: Request) {
  if (process.env.RATE_LIMIT_BYPASS_LOCALHOST === "false") return false;

  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const forwardedHost = request.headers.get("x-forwarded-host")?.toLowerCase() ?? "";
  const urlHost = request.url ? new URL(request.url).hostname.toLowerCase() : "";

  if (process.env.RATE_LIMIT_BYPASS_LOCALHOST === "true" || process.env.NODE_ENV !== "production") {
    return host.includes("localhost") || host.includes("127.0.0.1") || forwardedHost.includes("localhost") || urlHost.includes("localhost") || urlHost.includes("127.0.0.1");
  }

  return false;
}

export async function enforceRateLimit(
  request: Request,
  route: string,
  options?: {
    group?: RateLimitGroup;
    email?: string;
    accountId?: string;
    message?: string;
  }
) {
  if (shouldBypassRateLimitForLocalhost(request)) {
    return null;
  }

  const group = options?.group ?? inferRateLimitGroup(route);
  const policy = getRateLimitPolicy(group);
  const rateLimit = await checkRateLimit(
    buildRateLimitKeys(request, route, {
      group,
      email: options?.email,
      accountId: options?.accountId,
    }),
    policy,
  );

  if (!rateLimit.allowed) {
    const retryDelay = formatRateLimitRetryDelay(rateLimit.retryAfterSeconds ?? 0);
    return NextResponse.json(
      {
        success: false,
        message:
          options?.message?.replace("{retryAfter}", retryDelay) ||
          `Too many requests. Please try again in ${retryDelay}.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds ?? 1),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  return null;
}

export async function enforceAuthenticatedRateLimit(
  request: Request,
  route: string,
  group: "user" | "admin",
) {
  const token = (await cookies()).get("token")?.value;
  const user = await getUserForToken(token);
  if (!user) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }
  if (group === "admin" && (user.isBlocked || !canAccessAdminPortal(user.role))) {
    return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
  }

  return enforceRateLimit(request, route, { group, accountId: user.id });
}
