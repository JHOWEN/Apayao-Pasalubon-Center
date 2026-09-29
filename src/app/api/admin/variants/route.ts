import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureAuthenticatedAdmin } from "@/lib/auth";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:variants:create", "admin");
    if (rateLimitResponse) return rateLimitResponse;
    const userId = await ensureAuthenticatedAdmin();
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

    const body = await request.json();
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    const sku = typeof body.sku === "string" ? body.sku.trim() : "";
    if (!productId || !sku) return NextResponse.json({ success: false, message: "Product and product code are required." }, { status: 400 });

    const stock = Math.max(0, Math.trunc(Number(body.stock ?? 0)));
    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true } });
    const variant = await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: productId }, data: { hasVariants: true } });
      const created = await tx.productVariant.create({
        data: {
          productId,
          sku,
          price: Number(body.price ?? 0),
          cost: Number(body.cost ?? 0),
          stock,
          minStock: Number(body.minStock ?? 5),
          attributes: JSON.stringify(body.attributes && typeof body.attributes === "object" ? body.attributes : {}),
          imageUrl: Array.isArray(body.imageUrls) ? JSON.stringify(body.imageUrls.filter((value: unknown): value is string => typeof value === "string" && Boolean(value.trim()))) : null,
        },
      });

      if (stock > 0) {
        const product = await tx.product.findUnique({ where: { id: productId }, select: { name: true } });
        await tx.inventoryTransaction.create({
          data: { productId, variantId: created.id, productName: product?.name ?? null, type: "STOCK_IN", eventType: "STOCK_IN", quantity: stock, stockBefore: 0, stockAfter: stock, remarks: `Initial stock - variant ${sku}`, performedByName: actor?.name ?? null, performedByType: actor?.role ?? "ADMIN", source: "INVENTORY" },
        });
      }

      return created;
    });

    return NextResponse.json({ success: true, variant }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ success: false, message: "That product code is already in use." }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to add variant." }, { status: 500 });
  }
}