import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ensureAuthenticatedAdmin } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { isDirectStockOutReason } from "@/lib/direct-stock-out";

const STORE_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseStoreDateStart(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const [year, month, day] = value.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return undefined;
  }

  return new Date(calendarDate.getTime() - STORE_UTC_OFFSET_MS);
}

export async function GET(request: Request) {
  const userId = await ensureAuthenticatedAdmin();
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }
  const rateLimitResponse = await enforceRateLimit(request, "admin:reports:direct-stock-out:get", {
    group: "admin",
    accountId: userId,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { searchParams } = new URL(request.url);
    const startDate = parseStoreDateStart(searchParams.get("startDate"));
    const endDateStart = parseStoreDateStart(searchParams.get("endDate"));
    const selectedReason = searchParams.get("reason") ?? "";
    const exportAll = searchParams.get("export") === "1";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const limit = exportAll ? 10_000 : 25;
    const endDateExclusive = endDateStart ? new Date(endDateStart.getTime() + DAY_MS) : null;

    if (startDate === undefined || endDateStart === undefined) {
      return NextResponse.json({ success: false, message: "Enter valid start and end dates." }, { status: 400 });
    }
    if (endDateExclusive && startDate && endDateExclusive <= startDate) {
      return NextResponse.json({ success: false, message: "End date cannot be earlier than start date." }, { status: 400 });
    }
    if (
      selectedReason &&
      selectedReason !== "UNSPECIFIED" &&
      !isDirectStockOutReason(selectedReason)
    ) {
      return NextResponse.json({ success: false, message: "Select a valid stock-out reason." }, { status: 400 });
    }

    const createdAt = startDate || endDateExclusive
      ? {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDateExclusive ? { lt: endDateExclusive } : {}),
        }
      : undefined;
    const where: Prisma.InventoryTransactionWhereInput = {
      type: "STOCK_OUT",
      source: "INVENTORY",
      ...(createdAt ? { createdAt } : {}),
      ...(selectedReason === "UNSPECIFIED"
        ? { reason: null }
        : selectedReason
          ? { reason: selectedReason }
          : {}),
    };

    const [transactions, reasonGroups] = await Promise.all([
      prisma.inventoryTransaction.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: exportAll ? 0 : (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          productName: true,
          variantSku: true,
          reason: true,
          quantity: true,
          unitCostSnapshot: true,
          stockBefore: true,
          stockAfter: true,
          remarks: true,
          createdAt: true,
          performedByName: true,
          isArchived: true,
          product: { select: { name: true } },
        },
      }),
      prisma.$queryRaw<Array<{
        reason: string;
        entries: number;
        units: number;
        estimatedValue: number;
        unvaluedEntries: number;
      }>>`
        SELECT
          COALESCE("reason", 'UNSPECIFIED') AS "reason",
          COUNT(*)::int AS "entries",
          COALESCE(SUM("quantity"), 0)::int AS "units",
          COALESCE(SUM("quantity" * "unitCostSnapshot"), 0)::double precision AS "estimatedValue",
          COUNT(*) FILTER (WHERE "unitCostSnapshot" IS NULL)::int AS "unvaluedEntries"
        FROM "InventoryTransaction"
        WHERE "type" = 'STOCK_OUT'
          AND "source" = 'INVENTORY'
          AND (CAST(${startDate} AS timestamptz) IS NULL OR "createdAt" >= CAST(${startDate} AS timestamptz))
          AND (CAST(${endDateExclusive} AS timestamptz) IS NULL OR "createdAt" < CAST(${endDateExclusive} AS timestamptz))
          AND (CAST(${selectedReason || null} AS text) IS NULL OR COALESCE("reason", 'UNSPECIFIED') = CAST(${selectedReason || null} AS text))
        GROUP BY COALESCE("reason", 'UNSPECIFIED')
        ORDER BY "units" DESC, "reason" ASC
      `,
    ]);

    const reasonBreakdown = reasonGroups.map((group) => ({
      reason: group.reason,
      entries: Number(group.entries),
      units: Number(group.units),
      estimatedValue: Number(group.estimatedValue),
      unvaluedEntries: Number(group.unvaluedEntries),
    }));
    const summary = reasonBreakdown.reduce(
      (totals, group) => ({
        entries: totals.entries + group.entries,
        units: totals.units + group.units,
        estimatedValue: totals.estimatedValue + group.estimatedValue,
        unvaluedEntries: totals.unvaluedEntries + group.unvaluedEntries,
      }),
      { entries: 0, units: 0, estimatedValue: 0, unvaluedEntries: 0 },
    );

    return NextResponse.json(
      {
        success: true,
        summary,
        reasonBreakdown,
        transactions: transactions.map((transaction) => {
          const unitCost = transaction.unitCostSnapshot == null
            ? null
            : Number(transaction.unitCostSnapshot);
          return {
            ...transaction,
            reason: transaction.reason ?? "UNSPECIFIED",
            productDisplayName: transaction.productName ?? transaction.product?.name ?? "Unknown product",
            unitCostSnapshot: unitCost,
            estimatedLossValue: unitCost == null ? null : unitCost * transaction.quantity,
          };
        }),
        pagination: {
          page: exportAll ? 1 : page,
          pageSize: limit,
          totalCount: summary.entries,
          totalPages: exportAll ? 1 : Math.max(1, Math.ceil(summary.entries / limit)),
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("[GET /api/admin/reports/direct-stock-out] failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to load the direct stock-out report." },
      { status: 500 },
    );
  }
}
