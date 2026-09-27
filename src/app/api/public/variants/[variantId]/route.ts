import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseImageUrls } from "@/features/catalog/utils/product-images";
import { getRequestId, logError } from "@/lib/logger";

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
    const { variantId } = await params;

    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: {
          include: { category: true },
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
        cost: Number(variant.cost),
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
    });
  } catch (error) {
    logError("public.variant.get_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json(
      { success: false, message: "Unable to load variant." },
      { status: 500 }
    );
  }
}

