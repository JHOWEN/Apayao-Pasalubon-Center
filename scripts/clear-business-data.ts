import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Clearing business data while preserving user accounts...");

  await prisma.$transaction(async (tx) => {
    // User-owned data. User accounts remain untouched.
    await tx.cartItem.deleteMany();
    await tx.cart.deleteMany();
    await tx.productReview.deleteMany();
    await tx.activityLog.deleteMany();

    // Order data.
    await tx.orderItem.deleteMany();
    await tx.order.deleteMany();

    // Inventory history.
    await tx.inventoryTransaction.deleteMany();

    // Product relationships and variants.
    await tx.productGroupItem.deleteMany();
    await tx.productVariant.deleteMany();
    await tx.product.deleteMany();

    // Catalog grouping and categories.
    await tx.productGroup.deleteMany();
    await tx.category.deleteMany();
  });

  const users = await prisma.user.groupBy({
    by: ["role"],
    _count: { id: true },
  });

  console.log("Business data cleared.");
  console.log("Preserved user accounts:", users);
}

main()
  .catch((error) => {
    console.error("Cleanup failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });