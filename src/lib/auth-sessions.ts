import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const REMEMBERED_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const REVOKED_JTI_KEY_PREFIX = "auth:revoked:jti:";

type AccessTokenClaims = jwt.JwtPayload & {
  sub: string;
  sid: string;
  jti: string;
  ver: number;
  exp: number;
};

let redisClient: Redis | null | undefined;

function getRedisClient() {
  if (typeof redisClient !== "undefined") return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  redisClient = url && token ? new Redis({ url, token }) : null;
  return redisClient;
}

function requireRedis() {
  const redis = getRedisClient();
  if (!redis && process.env.NODE_ENV === "production") {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for production authentication.");
  }
  return redis;
}

function hashRefreshToken(refreshToken: string) {
  return createHash("sha256").update(refreshToken).digest("hex");
}

function createRefreshToken() {
  return randomBytes(32).toString("base64url");
}

function getJwtSecret() {
  const configuredSecret = process.env.JWT_SECRET?.trim();
  if (configuredSecret) return configuredSecret;
  return process.env.NODE_ENV === "production" ? null : "apc-inventory-dev-secret";
}

export function verifyAccessToken(token: string) {
  const secret = getJwtSecret();
  if (!secret) return null;

  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      typeof payload.jti !== "string" ||
      typeof payload.ver !== "number" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    return payload as AccessTokenClaims;
  } catch {
    return null;
  }
}

export function signAccessToken(userId: string, sessionId: string, sessionVersion: number) {
  const secret = getJwtSecret();
  if (!secret) throw new Error("JWT_SECRET must be configured in production.");

  return jwt.sign(
    { sub: userId, sid: sessionId, ver: sessionVersion },
    secret,
    { algorithm: "HS256", expiresIn: ACCESS_TOKEN_TTL_SECONDS, jwtid: randomUUID() }
  );
}

export async function createAuthSession(userId: string, sessionVersion: number, rememberMe = false) {
  const redis = requireRedis();
  if (redis) await redis.ping();

  const expiresAt = new Date(
    Date.now() + (rememberMe ? REMEMBERED_REFRESH_TOKEN_TTL_SECONDS : REFRESH_TOKEN_TTL_SECONDS) * 1000
  );
  const id = randomUUID();
  const refreshToken = createRefreshToken();
  const accessToken = signAccessToken(userId, id, sessionVersion);

  await prisma.authSession.create({
    data: { id, userId, refreshTokenHash: hashRefreshToken(refreshToken), expiresAt },
  });

  return { accessToken, refreshToken, refreshExpiresAt: expiresAt };
}

export async function rotateAuthSession(refreshToken: string) {
  const currentHash = hashRefreshToken(refreshToken);
  const now = new Date();
  const existing = await prisma.authSession.findUnique({ where: { refreshTokenHash: currentHash } });
  if (!existing || existing.expiresAt <= now) {
    if (existing) await prisma.authSession.deleteMany({ where: { id: existing.id } });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: existing.userId },
    select: { id: true, sessionVersion: true, isBlocked: true },
  });
  if (!user || user.isBlocked) {
    await prisma.authSession.deleteMany({ where: { id: existing.id } });
    return null;
  }

  const nextRefreshToken = createRefreshToken();
  const nextHash = hashRefreshToken(nextRefreshToken);
  const updated = await prisma.authSession.updateMany({
    where: { id: existing.id, refreshTokenHash: currentHash, expiresAt: { gt: now } },
    data: { refreshTokenHash: nextHash },
  });
  if (updated.count !== 1) return null;

  const accessToken = signAccessToken(user.id, existing.id, user.sessionVersion);
  return {
    accessToken,
    refreshToken: nextRefreshToken,
    refreshExpiresAt: existing.expiresAt,
  };
}

export async function revokeAccessTokenId(jti: string, expiresAt: number) {
  const remainingTtl = Math.ceil(expiresAt - Date.now() / 1000);
  if (remainingTtl <= 0) return;

  const redis = requireRedis();
  if (!redis) return;
  await redis.set(`${REVOKED_JTI_KEY_PREFIX}${jti}`, "1", { ex: remainingTtl });
}

async function isAccessTokenIdRevoked(jti: string) {
  const redis = requireRedis();
  if (!redis) return false;
  return (await redis.get(`${REVOKED_JTI_KEY_PREFIX}${jti}`)) !== null;
}

export async function validateAccessToken(token: string) {
  const claims = verifyAccessToken(token);
  if (!claims || await isAccessTokenIdRevoked(claims.jti)) return null;

  const [user, session] = await Promise.all([
    prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, role: true, isBlocked: true, sessionVersion: true },
    }),
    prisma.authSession.findFirst({
      where: { id: claims.sid, userId: claims.sub, expiresAt: { gt: new Date() } },
      select: { id: true },
    }),
  ]);

  if (!user || !session || user.isBlocked || user.sessionVersion !== claims.ver) return null;
  return { ...user, sub: user.id };
}

export async function revokeUserSessions(userId: string) {
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    }),
    prisma.authSession.deleteMany({ where: { userId } }),
  ]);
}

export async function revokeRefreshSession(refreshToken: string) {
  const session = await prisma.authSession.findUnique({
    where: { refreshTokenHash: hashRefreshToken(refreshToken) },
    select: { id: true, userId: true },
  });
  if (!session) return null;

  await revokeUserSessions(session.userId);
  return session.userId;
}
