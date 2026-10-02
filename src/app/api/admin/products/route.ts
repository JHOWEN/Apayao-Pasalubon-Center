import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureAuthenticatedAdmin, verifyToken } from "@/lib/auth";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";
import { cookies } from "next/headers";
import { deleteProductImageUrls } from "@/lib/storage";
import { parseImageUrls } from "@/features/catalog/utils/product-images";
import { getRequestId, logError } from "@/lib/logger";
import { getUserFacingErrorMessage } from "@/lib/api-response";

function serializeProduct(product: {
  price: number | string | null | { toNumber(): number };
  cost: number | string | null | { toNumber(): number };
  stock?: number | string | null;
  minStock?: number | string | null;
  variants?: unknown[];
} & Record<string, unknown>) {
  return {
    ...product,
    price: Number(product.price),
    cost: Number(product.cost),
    stock: Number(product.stock ?? 0),
    minStock: Number(product.minStock ?? 0),
    sellingMode: product.sellingMode,
    variants: Array.isArray(product.variants)
      ? product.variants.map((variant) => {
          const variantRecord = variant as Record<string, unknown>;
          return {
            id: typeof variantRecord.id === "string" ? variantRecord.id : "",
            productId: typeof variantRecord.productId === "string" ? variantRecord.productId : "",
            sku: typeof variantRecord.sku === "string" ? variantRecord.sku : "",
            attributes: typeof variantRecord.attributes === "string"
              ? (() => { try { const parsed = JSON.parse(variantRecord.attributes); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } })()
              : {},
            imageUrls: parseImageUrls(typeof variantRecord.imageUrl === "string" ? variantRecord.imageUrl : null),
            isActive: variantRecord.isActive !== false,
            price: Number((variantRecord.price as number | string | { toNumber(): number } | undefined) ?? 0),
            cost: Number((variantRecord.cost as number | string | { toNumber(): number } | undefined) ?? 0),
            stock: Number((variantRecord.stock as number | string | undefined) ?? 0),
            minStock: Number((variantRecord.minStock as number | string | undefined) ?? 0),
            createdAt: variantRecord.createdAt,
            updatedAt: variantRecord.updatedAt,
          };
        })
      : [],
  };
}

type NormalizedVariant = {
  sku: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  isActive: boolean;
  attributes: string;
  imageUrl: string | null;
};

function normalizeOptionValues(input: unknown) {
  if (!Array.isArray(input)) {
    return null;
  }

  const normalized = input
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : undefined,
      optionValue: typeof item.optionValue === "string" ? item.optionValue.trim() : "",
      assignedProductId: typeof item.assignedProductId === "string" ? item.assignedProductId.trim() : "",
      isParentOption: item.isParentOption === true,
      sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : 0,
    }))
    .filter((item) => item.optionValue && item.assignedProductId);

  return normalized.length ? JSON.stringify(normalized) : null;
}

export async function GET(request: Request) {
  const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:products:get", "admin");
  if (rateLimitResponse) return rateLimitResponse;
  const userId = await ensureAuthenticatedAdmin();
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.has("page")) {
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 10));
    const search = searchParams.get("search")?.trim().slice(0, 120) ?? "";
    const categoryId = searchParams.get("categoryId")?.trim() ?? "";
    const productType = searchParams.get("type");
    const baseWhere = {
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { sku: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
              { category: { name: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };
    const where = {
      ...baseWhere,
      ...(productType === "SIMPLE"
        ? { variants: { none: {} } }
        : productType === "VARIANT"
          ? { variants: { some: {} } }
          : {}),
    };
    const [products, totalCount, simpleCount, variantCount, summaryRows] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: true, variants: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
      prisma.product.count({ where: { ...baseWhere, variants: { none: {} } } }),
      prisma.product.count({ where: { ...baseWhere, variants: { some: {} } } }),
      prisma.$queryRaw<Array<{ totalProducts: number; totalStockUnits: number; totalStockValue: number; totalCostValue: number; totalRetailValue: number; lowStockCount: number }>>`
        SELECT
          (SELECT COUNT(*)::int FROM "Product") AS "totalProducts",
          (
            COALESCE((SELECT SUM(p."stock") FROM "Product" p
              WHERE NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p."id")), 0)
            + COALESCE((SELECT SUM(v."stock") FROM "ProductVariant" v), 0)
          )::int AS "totalStockUnits",
          (
            COALESCE((SELECT SUM(p."cost" * p."stock") FROM "Product" p
              WHERE NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p."id")), 0)
            + COALESCE((SELECT SUM(v."cost" * v."stock") FROM "ProductVariant" v), 0)
          )::double precision AS "totalStockValue",
          (
            COALESCE((SELECT SUM(p."cost" * p."stock") FROM "Product" p
              WHERE NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p."id")), 0)
            + COALESCE((SELECT SUM(v."cost" * v."stock") FROM "ProductVariant" v), 0)
          )::double precision AS "totalCostValue",
          (
            COALESCE((SELECT SUM(p."price" * p."stock") FROM "Product" p
              WHERE NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p."id")), 0)
            + COALESCE((SELECT SUM(v."price" * v."stock") FROM "ProductVariant" v), 0)
          )::double precision AS "totalRetailValue",
          (
            (SELECT COUNT(*) FROM "Product" p
              WHERE NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p."id")
                AND p."stock" <= p."minStock")
            + (SELECT COUNT(*) FROM "ProductVariant" v WHERE v."stock" <= v."minStock")
          )::int AS "lowStockCount"
      `,
    ]);
    const summary = summaryRows[0] ?? { totalProducts: 0, totalStockUnits: 0, totalStockValue: 0, totalCostValue: 0, totalRetailValue: 0, lowStockCount: 0 };

    return NextResponse.json(
      {
        products: products.map((product) => serializeProduct(product)),
        pagination: { page, limit, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / limit)) },
        typeCounts: { ALL: simpleCount + variantCount, SIMPLE: simpleCount, VARIANT: variantCount },
        summary: {
          totalProducts: Number(summary.totalProducts),
          totalStockUnits: Number(summary.totalStockUnits),
          totalStockValue: Number(summary.totalStockValue),
          totalCostValue: Number(summary.totalCostValue),
          totalRetailValue: Number(summary.totalRetailValue),
          lowStockCount: Number(summary.lowStockCount),
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const products = await prisma.product.findMany({
    include: {
      category: true,
      variants: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(products.map((product) => serializeProduct(product)), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request) {
  try {
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:products:create", "admin");
    if (rateLimitResponse) return rateLimitResponse;
    const userId = await ensureAuthenticatedAdmin();
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const nextImageUrls = typeof body.imageUrls !== "undefined"
      ? (Array.isArray(body.imageUrls) ? body.imageUrls.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0).map((value: string) => value.trim()) : [])
      : parseImageUrls(body.imageUrl ?? null);
    const normalizedOptionValues = normalizeOptionValues(body.optionValues);
    const hasVariants = body.hasVariants === true;
    const sellingMode = hasVariants ? "PARENT_AND_VARIANTS" : "SIMPLE";
    const submittedVariants = Array.isArray(body.variants) ? body.variants : [];

    if (hasVariants && submittedVariants.length === 0) {
      return NextResponse.json({ success: false, message: "At least one variant is required." }, { status: 400 });
    }

    const normalizedVariants: NormalizedVariant[] = submittedVariants.map((variant: Record<string, unknown>) => ({
      sku: typeof variant.sku === "string" ? variant.sku.trim() : "",
      price: Number(variant.price ?? 0),
      cost: Number(variant.cost ?? 0),
      stock: Number(variant.stock ?? 0),
      minStock: Number(variant.minStock ?? body.minStock ?? 5),
      isActive: variant.isActive !== false,
      attributes: JSON.stringify(variant.attributeValues && typeof variant.attributeValues === "object" && !Array.isArray(variant.attributeValues) ? variant.attributeValues : {}),
      imageUrl: Array.isArray(variant.imageUrls) ? JSON.stringify(variant.imageUrls.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim())) : null,
    }));

    if (hasVariants && normalizedVariants.some((variant) => !variant.sku || !Number.isFinite(variant.price) || !Number.isFinite(variant.cost) || !Number.isInteger(variant.stock) || variant.stock < 0)) {
      return NextResponse.json({ success: false, message: "Each variant needs a unique SKU, valid price, cost, and stock." }, { status: 400 });
    }

    if (hasVariants && new Set(normalizedVariants.map((variant) => variant.sku)).size !== normalizedVariants.length) {
      return NextResponse.json({ success: false, message: "Variant SKUs must be unique." }, { status: 400 });
    }

    if (!body.name?.trim() || !body.categoryId || (!hasVariants && !body.sku?.trim())) {
      return NextResponse.json({ success: false, message: hasVariants ? "Product name and category are required." : "Name, category, and SKU are required." }, { status: 400 });
    }

    const normalizedImageUrl = nextImageUrls.length ? JSON.stringify(nextImageUrls) : null;
    const initialStock = Number(body.stock ?? 0);
    const parentSku = hasVariants
      ? `PARENT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : (typeof body.sku === "string" && body.sku.trim() ? body.sku.trim() : `PRODUCT-${Date.now()}`);

    const existingProduct = await prisma.product.findUnique({
      where: { sku: parentSku },
      select: { id: true },
    });
    if (existingProduct) {
      return NextResponse.json(
        { success: false, message: `The product code "${parentSku}" is already in use. Please enter a different product code.` },
        { status: 409 },
      );
    }

    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true } });

    const product = await prisma.$transaction(async (tx) => {
      const createdProduct = await tx.product.create({
        data: {
          name: String(body.name).trim(),
          sku: parentSku,
          description: typeof body.description === "string" ? body.description.trim() || null : null,
          imageUrl: normalizedImageUrl,
          price: Number(body.price ?? 0),
          cost: Number(body.cost ?? 0),
          stock: initialStock,
          minStock: Number(body.minStock ?? 5),
          isActive: body.isActive ?? true,
          status: typeof body.status === "string" ? body.status : (body.isActive === false ? "UNPUBLISHED" : "PUBLISHED"),
          hasVariants,
          sellingMode,
          categoryId: String(body.categoryId),
          optionType: typeof body.optionType === "string" && body.optionType.trim() ? body.optionType.trim() : null,
          optionName: typeof body.optionName === "string" && body.optionName.trim() ? body.optionName.trim() : null,
          optionValues: normalizedOptionValues,
        },
      });

      if (initialStock > 0) {
        await tx.inventoryTransaction.create({
          data: {
            productId: createdProduct.id,
            productName: createdProduct.name,
            type: "STOCK_IN",
            eventType: "STOCK_IN",
            quantity: initialStock,
            stockBefore: 0,
            stockAfter: initialStock,
            remarks: "Initial stock - product created",
            performedByName: actor?.name ?? null,
            performedByType: actor?.role ?? "ADMIN",
            source: "INVENTORY",
          },
        });
      }

      if (hasVariants) {
        await tx.productVariant.createMany({ data: normalizedVariants.map((variant) => ({ productId: createdProduct.id, ...variant })) });
        const createdVariants = await tx.productVariant.findMany({ where: { productId: createdProduct.id }, select: { id: true, sku: true, stock: true } });
        await tx.inventoryTransaction.createMany({
          data: normalizedVariants.filter((variant) => variant.stock > 0).map((variant) => ({
            productId: createdProduct.id,
            variantId: createdVariants.find((createdVariant) => createdVariant.sku === variant.sku)?.id,
            productName: createdProduct.name,
            type: "STOCK_IN" as const,
            eventType: "STOCK_IN",
            quantity: variant.stock,
            stockBefore: 0,
            stockAfter: variant.stock,
            remarks: `Initial stock - variant ${variant.sku}`,
            performedByName: actor?.name ?? null,
            performedByType: actor?.role ?? "ADMIN",
            source: "INVENTORY",
          })),
        });
      }

      return createdProduct;
    });

    const updatedProduct = await prisma.product.findUnique({
      where: { id: product.id },
      include: { category: true, variants: true },
    });

    return NextResponse.json({ success: true, product: updatedProduct ? serializeProduct(updatedProduct) : serializeProduct(product) }, { status: 201 });
  } catch (error: unknown) {
    logError("admin.products.create_failed", error, { requestId: getRequestId(request) });
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json(
        { success: false, message: "That product code is already in use. Please enter a different product code." },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to create product.") }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:products:update", "admin");
    if (rateLimitResponse) return rateLimitResponse;
    const userId = await ensureAuthenticatedAdmin();
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ success: false, message: "Product id is required." }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    const hasImagePayload = typeof body.imageUrls !== "undefined" || typeof body.imageUrl !== "undefined";

    if (hasImagePayload) {
      const nextImageUrls = typeof body.imageUrls !== "undefined"
        ? (Array.isArray(body.imageUrls) ? body.imageUrls.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0).map((value: string) => value.trim()) : [])
        : parseImageUrls(body.imageUrl ?? null);
      updateData.imageUrl = nextImageUrls.length ? JSON.stringify(nextImageUrls) : null;
    }

    if (typeof body.name === "string") updateData.name = body.name.trim();
    if (!hasImagePayload && typeof body.sku === "string") updateData.sku = body.sku.trim();
    if (typeof body.description === "string") updateData.description = body.description.trim() || null;
    if (typeof body.price !== "undefined") updateData.price = Number(body.price ?? 0);
    if (typeof body.cost !== "undefined") updateData.cost = Number(body.cost ?? 0);
    if (typeof body.stock !== "undefined") updateData.stock = Number(body.stock ?? 0);
    if (typeof body.minStock !== "undefined") updateData.minStock = Number(body.minStock ?? 5);
    if (typeof body.isActive !== "undefined") updateData.isActive = body.isActive;
    if (typeof body.sellingMode === "string" && ["SIMPLE", "PARENT_AND_VARIANTS"].includes(body.sellingMode)) updateData.sellingMode = body.sellingMode;
      if (typeof body.status === "string" && ["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"].includes(body.status)) updateData.status = body.status;
    if (typeof body.categoryId === "string") updateData.categoryId = body.categoryId;
    if (typeof body.optionType === "string") {
      const normalizedOptionType = body.optionType.trim();
      updateData.optionType = normalizedOptionType || null;
    }
    if (typeof body.optionName === "string") {
      const normalizedOptionName = body.optionName.trim();
      updateData.optionName = normalizedOptionName || null;
    }
    if (typeof body.optionValues !== "undefined") {
      updateData.optionValues = normalizeOptionValues(body.optionValues);
    }

    const submittedVariants = Array.isArray(body.variants) ? body.variants : [];
    const productVariantUpdates: Array<{ id: string; sku?: string; price?: number; cost?: number; minStock?: number; attributes?: string; imageUrl?: string }> = submittedVariants.filter((variant: unknown): variant is Record<string, unknown> => Boolean(variant) && typeof variant === "object").map((variant: Record<string, unknown>) => ({
      id: typeof variant.id === "string" ? variant.id : "",
      sku: typeof variant.sku === "string" ? variant.sku.trim() : undefined,
      price: typeof variant.price !== "undefined" ? Number(variant.price) : undefined,
      cost: typeof variant.cost !== "undefined" ? Number(variant.cost) : undefined,
      minStock: typeof variant.minStock !== "undefined" ? Number(variant.minStock) : undefined,
      attributes: variant.attributeValues && typeof variant.attributeValues === "object" && !Array.isArray(variant.attributeValues) ? JSON.stringify(variant.attributeValues) : undefined,
      imageUrl: Array.isArray(variant.imageUrls) ? JSON.stringify(variant.imageUrls.filter((value: unknown): value is string => typeof value === "string" && Boolean(value.trim())).map((value: string) => value.trim())) : undefined,
    })).filter((variant: { id: string }) => variant.id);

    if (!Object.keys(updateData).length) {
      return NextResponse.json({ success: false, message: "No product data to update." }, { status: 400 });
    }

    if (typeof updateData.sku === "string") {
      const duplicateSku = await prisma.product.findFirst({
        where: { sku: updateData.sku, NOT: { id: String(body.id) } },
        select: { id: true },
      });

      if (duplicateSku) {
        return NextResponse.json(
          { success: false, message: "That product SKU is already in use. Please enter a different SKU." },
          { status: 409 },
        );
      }
    }

    const productUpdateData = hasImagePayload && Object.keys(updateData).length === 1
      ? { imageUrl: updateData.imageUrl }
      : updateData;

    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: String(body.id) },
        data: productUpdateData,
        include: { category: true, variants: true },
      });

      for (const variant of productVariantUpdates) {
        const data: Record<string, unknown> = {};
        if (typeof variant.sku !== "undefined") data.sku = variant.sku;
        if (typeof variant.price !== "undefined") data.price = variant.price;
        if (typeof variant.cost !== "undefined") data.cost = variant.cost;
        if (typeof variant.minStock !== "undefined") data.minStock = variant.minStock;
        if (typeof variant.attributes !== "undefined") data.attributes = variant.attributes;
        if (typeof variant.imageUrl !== "undefined") data.imageUrl = variant.imageUrl;
        if (Object.keys(data).length) {
          await tx.productVariant.update({ where: { id: variant.id, productId: updated.id }, data });
        }
      }

      return tx.product.findUnique({ where: { id: updated.id }, include: { category: true, variants: true } });
    });

    return NextResponse.json({ success: true, product: product ? serializeProduct(product) : null });
  } catch (error: unknown) {
    logError("admin.products.update_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to update product.") }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:products:delete", "admin");
    if (rateLimitResponse) return rateLimitResponse;
    const token = (await cookies()).get("token")?.value;
    const payload = token ? (verifyToken(token) as { sub?: string } | null) : null;
    const admin = payload?.sub
      ? await prisma.user.findUnique({ where: { id: payload.sub }, select: { role: true } })
      : null;

    if (!payload?.sub || admin?.role !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Only administrators can delete products." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, message: "Product id is required." }, { status: 400 });
    }

    const existingProduct = await prisma.product.findUnique({ where: { id }, select: { imageUrl: true } });
    if (existingProduct) {
      await deleteProductImageUrls(existingProduct.imageUrl);
    }

    await prisma.$transaction([
      prisma.productGroupItem.deleteMany({ where: { inventoryProductId: id } }),
      prisma.cartItem.deleteMany({ where: { productId: id } }),
      prisma.orderItem.deleteMany({ where: { productId: id } }),
      prisma.productReview.deleteMany({ where: { productId: id } }),
      prisma.productVariant.deleteMany({ where: { productId: id } }),
    ]);

    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Product deleted." });
  } catch (error: unknown) {
    logError("admin.products.delete_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to delete product.") }, { status: 500 });
  }
}
