import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { prisma } from "@/lib/prisma";

type RateLimitEntry = {
  count: number;
  resetAt: number;
  blockedUntil: number | null;
};

const rateLimitEntries = new Map<string, RateLimitEntry>();
const defaultWindowMs = 15 * 60 * 1000;
const defaultBlockMs = 15 * 60 * 1000;
const defaultMaxAttempts = 5;
const loginMaxAttempts = 3;
const redisKeyPrefix = "apc:rate-limit:";
const redisCheckScript = `
local blockedKey = KEYS[1] .. ':blocked'
local countKey = KEYS[1] .. ':count'
local blockedUntil = redis.call('GET', blockedKey)
if blockedUntil then
  return { 0, blockedUntil }
end

local count = redis.call('INCR', countKey)
if count == 1 then
  redis.call('EXPIRE', countKey, ARGV[2])
end

if count >= tonumber(ARGV[1]) then
  redis.call('SET', blockedKey, ARGV[3], 'EX', ARGV[3])
  return { 0, ARGV[3] }
end

return { 1, 0 }
`;

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
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return null;
}

export function buildRateLimitKeys(request: Request, route: string, email?: string) {
  const normalizedRoute = normalizeKey(route);

  if (normalizedRoute.startsWith("public:") && request.method === "GET") {
    return [normalizedRoute];
  }

  const result: string[] = [];

  if (email?.trim()) {
    result.push(`${normalizedRoute}:email:${email.trim().toLowerCase()}`);
  }

  const ip = getClientIp(request);
  if (ip) {
    result.push(`${normalizedRoute}:ip:${normalizeKey(ip)}`);
  }

  if (!result.length) {
    result.push(normalizedRoute);
  }

  return result;
}

function cleanupExpiredEntries(now: number) {
  for (const [key, entry] of rateLimitEntries.entries()) {
    if (entry.blockedUntil && entry.blockedUntil <= now) {
      rateLimitEntries.delete(key);
      continue;
    }

    if (entry.resetAt <= now) {
      rateLimitEntries.delete(key);
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

async function checkDatabaseRateLimit(
  keys: string[],
  maxAttempts = defaultMaxAttempts,
  windowMs = defaultWindowMs
) {
  const now = Date.now();
  cleanupExpiredEntries(now);

  const normalizedKeys = keys.map(normalizeKey);

  try {
    return await prisma.$transaction(async (tx) => {
      let blockedRetryAfter = 0;

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
          continue;
        }

        const isExpired = entry.resetAt.getTime() <= currentTime;
        const nextCount = isExpired ? 1 : entry.count + 1;
        const nextResetAt = isExpired ? new Date(currentTime + windowMs) : entry.resetAt;
        const shouldBlock = !isExpired && nextCount >= maxAttempts;
        const nextBlockedUntil = shouldBlock ? new Date(currentTime + defaultBlockMs) : null;

        await tx.$executeRaw`
          UPDATE "RateLimitEntry"
          SET "count" = ${nextCount}, "resetAt" = ${nextResetAt}, "blockedUntil" = ${nextBlockedUntil}, "updatedAt" = NOW()
          WHERE "key" = ${key}
        `;

        if (shouldBlock) {
          blockedRetryAfter = Math.max(blockedRetryAfter, Math.ceil(defaultBlockMs / 1000));
        }
      }

      return blockedRetryAfter > 0
        ? { allowed: false, retryAfterSeconds: blockedRetryAfter }
        : { allowed: true, retryAfterSeconds: null };
    }, { isolationLevel: "Serializable" });
  } catch {
    return checkLocalRateLimit(normalizedKeys, maxAttempts, windowMs);
  }
}

function checkLocalRateLimit(
  normalizedKeys: string[],
  maxAttempts: number,
  windowMs: number,
) {
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

  let blocked = false;

  for (const key of normalizedKeys) {
    const existingEntry = rateLimitEntries.get(key);

    if (!existingEntry || existingEntry.resetAt <= now) {
      rateLimitEntries.set(key, {
        count: 1,
        resetAt: now + windowMs,
        blockedUntil: null,
      });
      continue;
    }

    existingEntry.count += 1;

    if (existingEntry.count >= maxAttempts) {
      existingEntry.blockedUntil = now + defaultBlockMs;
      existingEntry.resetAt = existingEntry.blockedUntil;
      blocked = true;
    }

    rateLimitEntries.set(key, existingEntry);
  }

  if (blocked) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(defaultBlockMs / 1000),
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
      keys.map((key) => redis.get<string>(`${getRedisKey(key)}:blocked`)),
    );
    const retryAfterSeconds = blockedUntilValues
      .map((value) => Number(value ?? 0))
      .find((value) => value > 0);

    return retryAfterSeconds
      ? { allowed: false, retryAfterSeconds }
      : { allowed: true, retryAfterSeconds: null };
  } catch {
    return getDatabaseRateLimitStatus(keys);
  }
}

export async function checkRateLimit(
  keys: string[],
  maxAttempts = defaultMaxAttempts,
  windowMs = defaultWindowMs,
) {
  const redis = getRedisClient();
  if (!redis) return checkDatabaseRateLimit(keys, maxAttempts, windowMs);

  try {
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    const blockSeconds = Math.max(1, Math.ceil(defaultBlockMs / 1000));

    for (const key of keys) {
      const result = (await redis.eval(
        redisCheckScript,
        [getRedisKey(key)],
        [String(maxAttempts), String(windowSeconds), String(blockSeconds)],
      )) as unknown[];
      const allowed = Number(result[0]) === 1;

      if (!allowed) {
        return {
          allowed: false,
          retryAfterSeconds: Number(result[1]) || blockSeconds,
        };
      }
    }

    return { allowed: true, retryAfterSeconds: null };
  } catch {
    return checkDatabaseRateLimit(keys, maxAttempts, windowMs);
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
  return checkRateLimit([`auth:login:email:${email.trim().toLowerCase()}`], loginMaxAttempts, defaultWindowMs);
}

export async function getLoginRateLimitStatus(request: Request, email: string) {
  return getRateLimitStatus([`auth:login:email:${email.trim().toLowerCase()}`]);
}

export async function resetLoginRateLimit(request: Request, email: string) {
  await resetRateLimit([`auth:login:email:${email.trim().toLowerCase()}`]);
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
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const forwardedHost = request.headers.get("x-forwarded-host")?.toLowerCase() ?? "";
  const urlHost = request.url ? new URL(request.url).hostname.toLowerCase() : "";

  if (process.env.NODE_ENV !== "production") {
    return host.includes("localhost") || host.includes("127.0.0.1") || forwardedHost.includes("localhost") || urlHost.includes("localhost") || urlHost.includes("127.0.0.1");
  }

  return false;
}

export async function enforceRateLimit(
  request: Request,
  route: string,
  options?: {
    email?: string;
    maxAttempts?: number;
    windowMs?: number;
    message?: string;
  }
) {
  if (shouldBypassRateLimitForLocalhost(request)) {
    return null;
  }

  const rateLimit = await checkRateLimit(
    buildRateLimitKeys(request, route, options?.email),
    options?.maxAttempts,
    options?.windowMs
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        message:
          options?.message ||
          `Too many requests. Please try again in ${formatRateLimitRetryDelay(rateLimit.retryAfterSeconds ?? 0)}.`,
      },
      { status: 429 }
    );
  }

  return null;
}
