import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { parseImageUrls } from "@/features/catalog/utils/product-images";
import { getRequestId, logError } from "@/lib/logger";
import { apiError } from "@/lib/api-response";

const PUBLIC_PRODUCTS_CACHE_MS = 15_000;

type PublicProductsCachePayload =
  | {
      success: true;
      products?: unknown[];
      product?: unknown;
      pagination?: unknown;
    }
  | {
      success: false;
      message: string;
      status: number;
    };

const publicProductsCache = new Map<string, { expiresAt: number; payload: PublicProductsCachePayload }>();

const publicProductsQuerySchema = z.object({
  id: z.string().trim().cuid().optional().or(z.literal("")),
  categoryId: z.string().trim().min(1).optional().or(z.literal("")),
  search: z.string().trim().max(120).optional().or(z.literal("")),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(24).default(12),
});

type PublicProductShape = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  imageUrl: string | null;
  price: unknown;
  stock: unknown;
  minStock: unknown;
  isActive: boolean;
  categoryId: string;
  createdAt: Date;
  updatedAt: Date;
  variants?: Array<{
    id: string;
    sku: string;
    measurementValue: number | null;
    measurementUnit: string | null;
    color: string | null;
    price: unknown;
    cost: unknown;
    stock: unknown;
    minStock: unknown;
    imageUrls?: string[];
  }>;
  category?: {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

function normalizeVariantAttributes(attributes: unknown): Record<string, string> {
  if (!attributes) return {};

  if (typeof attributes === "object" && !Array.isArray(attributes)) {
    return Object.entries(attributes as Record<string, unknown>).reduce<Record<string, string>>((result, [key, value]) => {
      result[key] = typeof value === "string" ? value : String(value ?? "");
      return result;
    }, {});
  }

  if (typeof attributes === "string") {
    try {
      const parsed = JSON.parse(attributes);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>((result, [key, value]) => {
          result[key] = typeof value === "string" ? value : String(value ?? "");
          return result;
        }, {});
      }
    } catch {
      return {};
    }
  }

  return {};
}

function serializeProduct(product: PublicProductShape) {
  const normalizedImageUrls = parseImageUrls((product as { imageUrl?: string | null }).imageUrl ?? null);

  return {
    ...product,
    imageUrl: normalizedImageUrls.length ? JSON.stringify(normalizedImageUrls) : null,
    price: Number(product.price),
    stock: Number(product.stock),
    minStock: Number(product.minStock),
    variants: product.variants?.map((variant) => {
      const imageUrls = parseImageUrls((variant as { imageUrl?: string | null }).imageUrl ?? null);

      return {
        ...variant,
        attributes: normalizeVariantAttributes((variant as { attributes?: unknown }).attributes),
        price: Number(variant.price),
        cost: Number(variant.cost),
        stock: Number(variant.stock),
        minStock: Number(variant.minStock),
        imageUrl: imageUrls.length ? JSON.stringify(imageUrls) : null,
        imageUrls,
      };
    }) ?? [],
  };
}

type ProductReviewSummary = { averageRating: number; reviewCount: number; latestReview: string | null; latestReviewAt: Date | null };

async function getSoldCounts(productIds: string[]) {
  const uniqueIds = [...new Set(productIds)];
  if (!uniqueIds.length) return new Map<string, number>();

  const rows = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { in: uniqueIds },
      order: {
        status: { in: ["CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "COMPLETED"] },
      },
    },
    _sum: { quantity: true },
  });

  return new Map(rows.map((row) => [row.productId, Number(row._sum.quantity ?? 0)]));
}

async function getReviewSummaries(productIds: string[]) {
  const uniqueIds = [...new Set(productIds)];
  if (!uniqueIds.length) return new Map<string, ProductReviewSummary>();

  const [aggregates, latestReviews] = await Promise.all([
    prisma.productReview.groupBy({
      by: ["productId"],
      where: { productId: { in: uniqueIds } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ productId: string; comment: string | null; createdAt: Date }>>`
      SELECT DISTINCT ON ("productId") "productId", comment, "createdAt"
      FROM "ProductReview"
      WHERE "productId" IN (${Prisma.join(uniqueIds)})
      ORDER BY "productId", "createdAt" DESC
    `,
  ]);

  const summaries = new Map<string, ProductReviewSummary>();
  for (const aggregate of aggregates) {
    summaries.set(aggregate.productId, {
      averageRating: aggregate._avg.rating ?? 0,
      reviewCount: aggregate._count._all,
      latestReview: null,
      latestReviewAt: null,
    });
  }
  for (const review of latestReviews) {
    const summary = summaries.get(review.productId);
    if (summary) {
      summary.latestReview = review.comment?.trim() || null;
      summary.latestReviewAt = review.createdAt;
    }
  }
  return summaries;
}

function combineReviewSummaries(productIds: string[], summaries: Map<string, ProductReviewSummary>) {
  const matchingSummaries = productIds.map((id) => summaries.get(id)).filter((summary): summary is ProductReviewSummary => Boolean(summary));
  const reviewCount = matchingSummaries.reduce((sum, summary) => sum + summary.reviewCount, 0);
  const ratingTotal = matchingSummaries.reduce((sum, summary) => sum + summary.averageRating * summary.reviewCount, 0);
  return {
    averageRating: reviewCount ? Number((ratingTotal / reviewCount).toFixed(1)) : 0,
    reviewCount,
    latestReview: [...matchingSummaries]
      .sort((left, right) => (right.latestReviewAt?.getTime() ?? 0) - (left.latestReviewAt?.getTime() ?? 0))[0]?.latestReview ?? null,
  };
}

async function buildPublicProductsPayload({
  id,
  categoryId,
  search,
  page,
  limit,
}: {
  id?: string;
  categoryId?: string;
  search?: string;
  page: number;
  limit: number;
}) {
  const normalizedId = typeof id === "string" && id.trim() ? id.trim() : undefined;

  if (normalizedId) {
    const productGroup = await prisma.productGroup.findUnique({
      where: { id: normalizedId },
      include: {
        items: {
          include: {
            inventoryProduct: {
              include: { category: true, variants: true },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (productGroup) {
      type ProductGroupItemWithProduct = {
        id: string;
        optionValue: string;
        sortOrder: number;
        inventoryProduct: PublicProductShape;
      };
      const items: ProductGroupItemWithProduct[] = productGroup.items.map((item) => ({
        id: item.id,
        optionValue: item.optionValue,
        sortOrder: item.sortOrder,
        inventoryProduct: {
          ...serializeProduct(item.inventoryProduct as unknown as PublicProductShape),
        },
      }));

      return {
        success: true,
        product: {
          id: productGroup.id,
          name: productGroup.name,
          sku: items.map((item: ProductGroupItemWithProduct) => item.inventoryProduct.sku).join(" / ") || "GROUP",
          description: productGroup.description,
          imageUrl: productGroup.imageUrl ?? items[0]?.inventoryProduct.imageUrl ?? null,
          price: Math.min(...items.map((item: ProductGroupItemWithProduct) => Number(item.inventoryProduct.price ?? 0))),
          stock: items.reduce((sum: number, item: ProductGroupItemWithProduct) => sum + Number(item.inventoryProduct.stock ?? 0), 0),
          minStock: 0,
          isActive: productGroup.status === "PUBLISHED",
          categoryId: items[0]?.inventoryProduct.categoryId ?? "",
          createdAt: productGroup.createdAt,
          updatedAt: productGroup.updatedAt,
          category: items[0]?.inventoryProduct.category ?? null,
          productGroup: {
            id: productGroup.id,
            name: productGroup.name,
            optionType: productGroup.optionType,
            optionName: productGroup.optionName,
            unit: productGroup.unit,
            items: items.map((item: ProductGroupItemWithProduct) => ({
              id: item.id,
              optionValue: item.optionValue,
              sortOrder: item.sortOrder,
              productId: item.inventoryProduct.id,
              inventoryProductId: item.inventoryProduct.id,
              inventoryProduct: {
                id: item.inventoryProduct.id,
                name: item.inventoryProduct.name,
                sku: item.inventoryProduct.sku,
                price: Number(item.inventoryProduct.price ?? 0),
                stock: Number(item.inventoryProduct.stock ?? 0),
                imageUrl: item.inventoryProduct.imageUrl,
              },
            })),
          },
        },
      };
    }

    const product = await prisma.product.findUnique({
      where: { id: normalizedId },
      include: { category: true, variants: true },
    });

    if (!product) {
      return { success: false, message: "Product not found.", status: 404 };
    }

    const matchingGroups = await prisma.productGroup.findMany({
      where: {
        status: "PUBLISHED",
        items: {
          some: {
            inventoryProductId: normalizedId,
          },
        },
      },
      include: {
        items: {
          include: {
            inventoryProduct: {
              include: { category: true, variants: true },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    const reviewSummary = combineReviewSummaries(
      [normalizedId],
      await getReviewSummaries([normalizedId]),
    );
    const matchedProductGroup = matchingGroups[0] ?? null;

    return {
      success: true,
      product: {
        ...serializeProduct(product as unknown as PublicProductShape),
        ...reviewSummary,
        productGroup: matchedProductGroup
          ? {
              id: matchedProductGroup.id,
              name: matchedProductGroup.name,
              optionType: matchedProductGroup.optionType,
              optionName: matchedProductGroup.optionName,
              unit: matchedProductGroup.unit,
              items: matchedProductGroup.items.map((item) => ({
                id: item.id,
                optionValue: item.optionValue,
                sortOrder: item.sortOrder,
                productId: item.inventoryProduct.id,
                inventoryProductId: item.inventoryProduct.id,
                inventoryProduct: {
                  id: item.inventoryProduct.id,
                  name: item.inventoryProduct.name,
                  sku: item.inventoryProduct.sku,
                  price: Number(item.inventoryProduct.price ?? 0),
                  stock: Number(item.inventoryProduct.stock ?? 0),
                  imageUrl: item.inventoryProduct.imageUrl,
                },
              })),
            }
          : null,
      },
    };
  }

  const productWhere: Prisma.ProductWhereInput = {
      isActive: true,
      status: "PUBLISHED",
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
              { category: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
  const groupWhere: Prisma.ProductGroupWhereInput = {
      status: "PUBLISHED",
      ...(categoryId ? { items: { some: { inventoryProduct: { categoryId } } } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
              {
                items: {
                  some: {
                    inventoryProduct: {
                      OR: [
                        { name: { contains: search, mode: "insensitive" } },
                        { sku: { contains: search, mode: "insensitive" } },
                        { description: { contains: search, mode: "insensitive" } },
                        { category: { name: { contains: search, mode: "insensitive" } } },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
  const candidateLimit = page * limit;
  const [productCandidates, groupCandidates, productCount, groupCount] = await Promise.all([
    prisma.product.findMany({ where: productWhere, select: { id: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: candidateLimit }),
    prisma.productGroup.findMany({ where: groupWhere, select: { id: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: candidateLimit }),
    prisma.product.count({ where: productWhere }),
    prisma.productGroup.count({ where: groupWhere }),
  ]);
  const totalCount = productCount + groupCount;
  const selectedEntries = [
    ...productCandidates.map((item) => ({ ...item, kind: "product" as const })),
    ...groupCandidates.map((item) => ({ ...item, kind: "group" as const })),
  ]
    .sort((left, right) =>
      right.createdAt.getTime() - left.createdAt.getTime() ||
      (left.kind === right.kind ? left.id.localeCompare(right.id) : left.kind === "product" ? -1 : 1),
    )
    .slice((page - 1) * limit, page * limit);
  const selectedProductIds = selectedEntries.filter((item) => item.kind === "product").map((item) => item.id);
  const selectedGroupIds = selectedEntries.filter((item) => item.kind === "group").map((item) => item.id);
  const [publishedProducts, publishedGroups] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: selectedProductIds } },
      include: { category: true, variants: true },
    }),
    prisma.productGroup.findMany({
      where: { id: { in: selectedGroupIds } },
      include: {
      items: {
        include: {
          inventoryProduct: {
            include: { category: true, variants: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    }),
  ]);

  const reviewProductIds = [
    ...publishedProducts.map((product) => product.id),
    ...publishedGroups.flatMap((group) => group.items.map((item) => item.inventoryProduct.id)),
  ];
  const [reviewSummaries, soldCounts] = await Promise.all([
    getReviewSummaries(reviewProductIds),
    getSoldCounts(reviewProductIds),
  ]);

  const directProducts = publishedProducts.map((product) => {
    return {
      ...serializeProduct(product as unknown as PublicProductShape),
      ...combineReviewSummaries([product.id], reviewSummaries),
      soldCount: soldCounts.get(product.id) ?? 0,
    };
  });

  const groupProducts = publishedGroups.map((group) => {
    type ProductGroupItemWithProduct = {
      id: string;
      optionValue: string;
      sortOrder: number;
      inventoryProduct: PublicProductShape;
    };
    const items: ProductGroupItemWithProduct[] = group.items.map((item) => ({
      id: item.id,
      optionValue: item.optionValue,
      sortOrder: item.sortOrder,
      inventoryProduct: {
        ...serializeProduct(item.inventoryProduct as unknown as PublicProductShape),
      },
    }));

    const reviewSummary = combineReviewSummaries(
      items.map((item) => item.inventoryProduct.id),
      reviewSummaries,
    );
    const soldCount = items.reduce(
      (total, item) => total + (soldCounts.get(item.inventoryProduct.id) ?? 0),
      0,
    );

    return {
      id: group.id,
      name: group.name,
      sku: items.map((item: ProductGroupItemWithProduct) => item.inventoryProduct.sku).join(" / ") || "GROUP",
      description: group.description,
      imageUrl: group.imageUrl ?? items[0]?.inventoryProduct.imageUrl ?? null,
      price: Math.min(...items.map((item: ProductGroupItemWithProduct) => Number(item.inventoryProduct.price ?? 0))),
      stock: items.reduce((sum: number, item: ProductGroupItemWithProduct) => sum + Number(item.inventoryProduct.stock ?? 0), 0),
      minStock: 0,
      isActive: group.status === "PUBLISHED",
      categoryId: items[0]?.inventoryProduct.categoryId ?? "",
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      category: items[0]?.inventoryProduct.category ?? null,
      ...reviewSummary,
      soldCount,
      productGroup: {
        id: group.id,
        name: group.name,
        optionType: group.optionType,
        optionName: group.optionName,
        unit: group.unit,
        items: items.map((item: ProductGroupItemWithProduct) => ({
          id: item.id,
          optionValue: item.optionValue,
          sortOrder: item.sortOrder,
          productId: item.inventoryProduct.id,
          inventoryProductId: item.inventoryProduct.id,
          inventoryProduct: {
            id: item.inventoryProduct.id,
            name: item.inventoryProduct.name,
            sku: item.inventoryProduct.sku,
            price: Number(item.inventoryProduct.price ?? 0),
            stock: Number(item.inventoryProduct.stock ?? 0),
            imageUrl: item.inventoryProduct.imageUrl,
          },
        })),
      },
    };
  });

  const catalogProducts = [...directProducts, ...groupProducts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const pageProducts = new Map(catalogProducts.map((product) => [product.id, product]));
  const paginatedProducts = selectedEntries
    .map((entry) => pageProducts.get(entry.id))
    .filter((product): product is (typeof catalogProducts)[number] => Boolean(product));

  return {
    success: true,
    products: paginatedProducts,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
    },
  };
}

async function getCachedPublicProductsPayload({
  id,
  categoryId,
  search,
  page,
  limit,
}: {
  id?: string;
  categoryId?: string;
  search?: string;
  page: number;
  limit: number;
}) {
  const cacheKey = JSON.stringify({
    id: typeof id === "string" ? id.trim() : "",
    categoryId: typeof categoryId === "string" ? categoryId.trim() : "",
    search: typeof search === "string" ? search.trim() : "",
    page,
    limit,
  });

  const now = Date.now();
  const cachedEntry = publicProductsCache.get(cacheKey);
  if (cachedEntry && cachedEntry.expiresAt > now) {
    return cachedEntry.payload;
  }

  const payload = (await buildPublicProductsPayload({ id, categoryId, search, page, limit })) as PublicProductsCachePayload;
  if (publicProductsCache.size >= 200) {
    const expiredKeys = [...publicProductsCache.entries()]
      .filter(([, entry]) => entry.expiresAt <= now)
      .map(([key]) => key);
    for (const key of expiredKeys) publicProductsCache.delete(key);
    if (publicProductsCache.size >= 200) {
      const oldestKey = publicProductsCache.keys().next().value;
      if (oldestKey) publicProductsCache.delete(oldestKey);
    }
  }
  publicProductsCache.set(cacheKey, { expiresAt: now + PUBLIC_PRODUCTS_CACHE_MS, payload });
  return payload;
}

export async function GET(request: Request) {
  try {
    const rateLimitResponse = await enforceRateLimit(request, "public:products", {
      group: "public",
      message: "Too many requests. Please try again in a moment.",
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = publicProductsQuerySchema.safeParse({
      id: searchParams.get("id") ?? undefined,
      categoryId: searchParams.get("categoryId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid query parameters.",
          errors: parsedQuery.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { id, categoryId, search, page, limit } = parsedQuery.data;
    const normalizedId = typeof id === "string" && id.trim() ? id.trim() : undefined;

    try {
      if (normalizedId) {
        const payload = await buildPublicProductsPayload({
          id: normalizedId,
          categoryId: categoryId ?? undefined,
          search: search ?? undefined,
          page,
          limit,
        });

        if (payload && "success" in payload && payload.success === false) {
          return NextResponse.json(
            { success: false, message: payload.message ?? "Product not found." },
            { status: payload.status ?? 404 },
          );
        }

        return NextResponse.json(payload as Record<string, unknown>);
      }

      const payload = await getCachedPublicProductsPayload({
        categoryId: categoryId ?? undefined,
        search: search ?? undefined,
        page,
        limit,
      });

      if (payload && "success" in payload && payload.success === false) {
        return NextResponse.json(
          { success: false, message: payload.message ?? "Product not found." },
          { status: payload.status ?? 404 },
        );
      }

      return NextResponse.json(payload as Record<string, unknown>, {
        headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=30" },
      });
    } catch (error) {
      logError("public.products.get_failed", error, { requestId: getRequestId(request) });
      return apiError(request, 503, "PRODUCTS_UNAVAILABLE", "Unable to load products right now.");
    }
  } catch (error) {
    logError("public.products.get_failed", error, { requestId: getRequestId(request) });
    return apiError(request, 503, "PRODUCTS_UNAVAILABLE", "Unable to load products right now.");
  }
}
