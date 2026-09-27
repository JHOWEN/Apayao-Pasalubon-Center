import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  const adminPassword = await bcrypt.hash("admin123!", 10);
  const customerPassword = await bcrypt.hash("customer123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@apc-inventory.com" },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@apc-inventory.com",
      password: adminPassword,
      role: "ADMIN",
      phone: "1234567890",
      address: "123 Admin Street",
      emailVerified: true,
      isBlocked: false,
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: "customer@example.com" },
    update: {},
    create: {
      name: "Customer User",
      email: "customer@example.com",
      password: customerPassword,
      role: "CUSTOMER",
      phone: "0987654321",
      address: "456 Customer Avenue",
      emailVerified: true,
      isBlocked: false,
    },
  });

  const category = await prisma.category.upsert({
    where: { name: "Electronics" },
    update: {},
    create: {
      name: "Electronics",
      description: "Electronic products and gadgets",
    },
  });

  const simpleProduct = await prisma.product.upsert({
    where: { sku: "HEADPHONES-001" },
    update: {},
    create: {
      name: "Wireless Headphones",
      sku: "HEADPHONES-001",
      description: "High-quality wireless Bluetooth headphones with active noise cancellation",
      price: 12999,
      cost: 8000,
      stock: 50,
      minStock: 5,
      isActive: true,
      categoryId: category.id,
      optionType: null,
      optionName: null,
      optionValues: null,
    },
  });

  const variantProduct = await prisma.product.upsert({
    where: { sku: "BUDGET-USB-CABLE" },
    update: {},
    create: {
      name: "USB-C Cable",
      sku: "BUDGET-USB-CABLE",
      description: "Durable USB-C cable with a few length options.",
      price: 29900,
      cost: 18000,
      stock: 28,
      minStock: 5,
      isActive: true,
      categoryId: category.id,
      optionType: "Length",
      optionName: "Length",
      optionValues: JSON.stringify([
        { optionValue: "1m", assignedProductId: "" },
        { optionValue: "2m", assignedProductId: "" },
      ]),
    },
  });

  await prisma.productVariant.createMany({
    data: [
      {
        productId: variantProduct.id,
        sku: "USB-C-CABLE-1M",
        price: 29900,
        cost: 18000,
        stock: 18,
        minStock: 3,
      },
      {
        productId: variantProduct.id,
        sku: "USB-C-CABLE-2M",
        price: 34900,
        cost: 22000,
        stock: 10,
        minStock: 3,
      },
    ],
  });

  console.log("✅ Seeded admin, customer, category, and products.");
  console.log("Admin login: admin@apc-inventory.com / admin123!");
  console.log("Customer login: customer@example.com / customer123!");
  console.log("Sample products:", {
    admin: admin.email,
    customer: customer.email,
    category: category.name,
    simpleProduct: simpleProduct.name,
    variantProduct: variantProduct.name,
  });
}

main()
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
