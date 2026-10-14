import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseImageUrls } from "@/features/catalog/utils/product-images";
import { getRequestId, logError } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ variantId: string }> }
) {
  try {
    const rateLimitResponse = await enforceRateLimit(request, "public:variants:detail", { group: "public" });
    if (rateLimitResponse) return rateLimitResponse;

    const { variantId } = await params;

    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: {
        id: true,
        sku: true,
        price: true,
        stock: true,
        minStock: true,
        imageUrl: true,
        attributes: true,
        product: {
          select: {
            id: true,
            name: true,
            categoryId: true,
            isActive: true,
            status: true,
            category: { select: { id: true, name: true, description: true, createdAt: true, updatedAt: true } },
          },
        },
      },
    });

    if (!variant || !variant.product.isActive || variant.product.status !== "PUBLISHED") {
      return NextResponse.json(
        { success: false, message: "Variant not found." },
        { status: 404 }
      );
    }

    const imageUrls = parseImageUrls(variant.imageUrl ?? null);

    return NextResponse.json({
      success: true,
      variant: {
        id: variant.id,
        sku: variant.sku,
        price: Number(variant.price),
        stock: variant.stock,
        minStock: variant.minStock,
        product: {
          id: variant.product.id,
          name: variant.product.name,
          categoryId: variant.product.categoryId,
          category: variant.product.category,
        },
        attributes: normalizeVariantAttributes(variant.attributes),
        imageUrl: imageUrls.length ? JSON.stringify(imageUrls) : null,
        imageUrls,
      },
    }, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=30" },
    });
  } catch (error) {
    logError("public.variant.get_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json(
      { success: false, message: "Unable to load variant." },
      { status: 500 }
    );
  }
}

