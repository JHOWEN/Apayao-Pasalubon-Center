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
    if (typeof body.sku === "string" && body.sku.trim()) updateData.sku = body.sku.trim();
    if (typeof body.isActive !== "undefined") updateData.isActive = body.isActive === true;
    if (Array.isArray(body.imageUrls)) updateData.imageUrl = JSON.stringify(body.imageUrls.filter((value: unknown): value is string => typeof value === "string" && Boolean(value.trim())).map((value: string) => value.trim()));
    if (body.attributes && typeof body.attributes === "object" && !Array.isArray(body.attributes)) updateData.attributes = JSON.stringify(body.attributes);

    const updatedVariant = await prisma.productVariant.update({
      where: { id: variantId },
      data: updateData,
      include: { product: true },
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
      await tx.inventoryTransaction.updateMany({ where: { variantId }, data: { variantId: null } });
      await tx.productVariant.delete({ where: { id: variantId } });
    });

    return NextResponse.json({ success: true, message: `Variant ${variant.sku} permanently deleted.` });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to remove variant." }, { status: 500 });
  }
}
