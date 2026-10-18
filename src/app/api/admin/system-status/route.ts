import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getConfiguredEmailProvider } from "@/lib/mailer";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CheckStatus = "operational" | "configured" | "attention" | "unavailable";

type CheckResult = {
  status: CheckStatus;
  label: string;
  detail: string;
  action: string;
};

const CHECK_TIMEOUT_MS = 5_000;

async function withTimeout<T>(operation: Promise<T>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Service check timed out.")), CHECK_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`);
    return {
      status: "operational",
      label: "Operational",
      detail: "Store data can be read from the database.",
      action: "No action needed.",
    };
  } catch {
    return {
      status: "unavailable",
      label: "Unavailable",
      detail: "The app could not connect to the database.",
      action: "Check the database provider and DATABASE_URL in the server environment settings.",
    };
  }
}

async function checkStorage(): Promise<CheckResult> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      status: "attention",
      label: "Not configured",
      detail: "Product images, review photos, and payment proofs use Supabase Storage.",
      action: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server, then confirm the required storage buckets exist.",
    };
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: buckets, error } = await withTimeout(supabase.storage.listBuckets());
    if (error) throw error;

    const requiredBuckets = [
      process.env.SUPABASE_PRODUCT_BUCKET?.trim() || "product-images",
      process.env.SUPABASE_PROFILE_BUCKET?.trim() || "profile-images",
      process.env.SUPABASE_RATING_IMAGE_BUCKET?.trim() || "RATINGS_IMAGES",
      process.env.SUPABASE_RECEIPT_BUCKET?.trim() || "payment-proofs",
      process.env.SUPABASE_PAYMENT_QR_BUCKET?.trim() || "payment-qr",
    ];
    const existingBuckets = new Set((buckets ?? []).map((bucket) => bucket.name));
    const missingBuckets = requiredBuckets.filter((bucket) => !existingBuckets.has(bucket));

    if (missingBuckets.length > 0) {
      return {
        status: "attention",
        label: "Setup needed",
        detail: `Supabase is reachable, but these required buckets are missing: ${missingBuckets.join(", ")}.`,
        action: "Create the listed buckets in Supabase Storage.",
      };
    }

    return {
      status: "operational",
      label: "Operational",
      detail: "Supabase Storage is reachable and the app's required buckets are present.",
      action: "No action needed.",
    };
  } catch {
    return {
      status: "unavailable",
      label: "Unavailable",
      detail: "The app could not check Supabase Storage.",
      action: "Check the Supabase project, server credentials, and Storage service status.",
    };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    const isProduction = process.env.NODE_ENV === "production";
    return {
      status: isProduction ? "unavailable" : "attention",
      label: "Not configured",
      detail: "Redis supports admin sessions and rate limits.",
      action: isProduction
        ? "Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to the server environment, then redeploy."
        : "Local development can run without Redis; configure it before production deployment.",
    };
  }

  try {
    const redis = new Redis({ url, token });
    await withTimeout(redis.ping());
    return {
      status: "operational",
      label: "Operational",
      detail: "Redis is reachable for session and rate-limit features.",
      action: "No action needed.",
    };
  } catch {
    return {
      status: "unavailable",
      label: "Unavailable",
      detail: "The app could not connect to Redis.",
      action: "Check the Upstash database and its URL and token in the server environment settings.",
    };
  }
}

function checkEmail(): CheckResult {
  const provider = getConfiguredEmailProvider();
  if (!provider) {
    return {
      status: "attention",
      label: "Setup needed",
      detail: "Email sends account verification and password reset messages.",
      action: "Set RESEND_API_KEY and RESEND_FROM, or SMTP_HOST (or SMTP_SERVICE), SMTP_USER, and SMTP_PASS, in the server environment.",
    };
  }

  return {
    status: "configured",
    label: `${provider} configured`,
    detail: "Used for account verification and password reset messages. This check does not send an email.",
    action: "If messages are not arriving, check the sender address or domain and delivery logs in the email provider.",
  };
}

export async function GET(request: Request) {
  const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:system-status:get", "admin");
  if (rateLimitResponse) return rateLimitResponse;

  const [database, storage, redis] = await Promise.all([checkDatabase(), checkStorage(), checkRedis()]);

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      checks: {
        database,
        storage,
        redis,
        email: checkEmail(),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
