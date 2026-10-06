import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureAuthenticatedAdmin } from "@/lib/auth";
import { getRequestId, logError } from "@/lib/logger";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ variantId: string }> }
) {
  try {
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:variants:update", "admin");
    if (rateLimitResponse) return rateLimitResponse;
    const userId = await ensureAuthenticatedAdmin();
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const { variantId } = await params;
    const body = await request.json();

    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
    });

    if (!variant) {
      return NextResponse.json(
        { success: false, message: "Variant not found." },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (typeof body.price !== "undefined")
      updateData.price = Number(body.price ?? 0);
    if (typeof body.cost !== "undefined")
      updateData.cost = Number(body.cost ?? 0);
    if (typeof body.stock !== "undefined")
      updateData.stock = Number(body.stock ?? 0);
    if (typeof body.minStock !== "undefined")
      updateData.minStock = Number(body.minStock ?? 5);
    if (typeof updateData.stock === "number" && (!Number.isInteger(updateData.stock) || updateData.stock < 0)) {
      return NextResponse.json({ success: false, message: "Stock must be a non-negative whole number." }, { status: 400 });
    }
    if (typeof updateData.minStock === "number" && (!Number.isInteger(updateData.minStock) || updateData.minStock < 0)) {
      return NextResponse.json({ success: false, message: "Minimum stock must be a non-negative whole number." }, { status: 400 });
    }
    if (typeof body.sku === "string" && body.sku.trim()) updateData.sku = body.sku.trim();
    if (typeof body.isActive !== "undefined") updateData.isActive = body.isActive === true;
    if (Array.isArray(body.imageUrls)) updateData.imageUrl = JSON.stringify(body.imageUrls.filter((value: unknown): value is string => typeof value === "string" && Boolean(value.trim())).map((value: string) => value.trim()));
    if (body.attributes && typeof body.attributes === "object" && !Array.isArray(body.attributes)) updateData.attributes = JSON.stringify(body.attributes);

    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true } });
    const updatedVariant = await prisma.$transaction(async (tx) => {
      const original = await tx.productVariant.findUnique({
        where: { id: variantId },
        include: { product: { select: { name: true } } },
      });
      if (!original) throw new Error("Variant not found.");

      const updated = await tx.productVariant.update({
        where: { id: variantId },
        data: updateData,
        include: { product: true },
      });

      if (original.stock !== updated.stock) {
        await tx.inventoryTransaction.create({
          data: {
            productId: updated.productId,
            variantId: updated.id,
            variantSku: original.sku,
            productName: original.product.name,
            performedById: userId,
            performedByName: actor?.name ?? null,
            performedByType: actor?.role ?? "ADMIN",
            source: "INVENTORY",
            type: "ADJUSTMENT",
            eventType: "ADJUSTMENT",
            quantity: updated.stock,
            stockBefore: original.stock,
            stockAfter: updated.stock,
            remarks: typeof body.stockChangeReason === "string" && body.stockChangeReason.trim()
              ? body.stockChangeReason.trim().slice(0, 500)
              : "Variant stock quantity updated from product management",
          },
        });
      }

      if (original.minStock !== updated.minStock) {
        await tx.inventoryTransaction.create({
          data: {
            productId: updated.productId,
            variantId: updated.id,
            variantSku: original.sku,
            productName: original.product.name,
            performedById: userId,
            performedByName: actor?.name ?? null,
            performedByType: actor?.role ?? "ADMIN",
            source: "INVENTORY",
            type: "ADJUSTMENT",
            eventType: "THRESHOLD_ADJUSTMENT",
            quantity: updated.minStock,
            stockBefore: updated.stock,
            stockAfter: updated.stock,
            minStockBefore: original.minStock,
            minStockAfter: updated.minStock,
            remarks: typeof body.minStockChangeReason === "string" && body.minStockChangeReason.trim()
              ? body.minStockChangeReason.trim().slice(0, 500)
              : "Variant minimum stock threshold updated from product management",
          },
        });
      }

      return updated;
    });

    return NextResponse.json({
      success: true,
      variant: {
        ...updatedVariant,
        price: Number(updatedVariant.price),
        cost: Number(updatedVariant.cost),
      },
    });
  } catch (error: unknown) {
    logError("admin.variant.update_failed", error, { requestId: getRequestId(request) });
    const message =
      error instanceof Error ? error.message : "Unable to update variant.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ variantId: string }> },
) {
  try {
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:variants:delete", "admin");
    if (rateLimitResponse) return rateLimitResponse;
    const userId = await ensureAuthenticatedAdmin();
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

    const { variantId } = await params;
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId }, select: { id: true, sku: true } });
    if (!variant) return NextResponse.json({ success: false, message: "Variant not found." }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      // Keep historical orders and audit rows, but detach the deleted option.
      await tx.cartItem.updateMany({ where: { variantId }, data: { variantId: null } });
      await tx.orderItem.updateMany({ where: { variantId }, data: { variantId: null } });
      await tx.inventoryTransaction.updateMany({ where: { variantId }, data: { variantId: null, variantSku: variant.sku } });
      await tx.productVariant.delete({ where: { id: variantId } });
    });

    return NextResponse.json({ success: true, message: `Variant ${variant.sku} permanently deleted.` });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to remove variant." }, { status: 500 });
  }
}
