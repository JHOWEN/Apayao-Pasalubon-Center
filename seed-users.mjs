import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

if (process.env.NODE_ENV === 'production') {
  throw new Error('User seed scripts are disabled in production.');
}

const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const customerEmail = process.env.SEED_CUSTOMER_EMAIL?.trim().toLowerCase();
const customerPassword = process.env.SEED_CUSTOMER_PASSWORD;

if (!adminEmail || !adminPassword || !customerEmail || !customerPassword) {
  throw new Error('Set SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_CUSTOMER_EMAIL, and SEED_CUSTOMER_PASSWORD.');
}

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding users...');

  const hashedAdminPassword = await bcrypt.hash(adminPassword, 12);
  const hashedCustomerPassword = await bcrypt.hash(customerPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'Admin',
      email: adminEmail,
      password: hashedAdminPassword,
      role: 'ADMIN',
      phone: '1234567890',
      address: '123 Admin Street',
      emailVerified: true,
      isBlocked: false,
    },
  });

  console.log('Admin created:', { id: admin.id, role: admin.role });

  const customer = await prisma.user.upsert({
    where: { email: customerEmail },
    update: {},
    create: {
      name: 'Customer User',
      email: customerEmail,
      password: hashedCustomerPassword,
      role: 'CUSTOMER',
      phone: '0987654321',
      address: '456 Customer Avenue',
      emailVerified: true,
      isBlocked: false,
    },
  });

  console.log('Customer created:', { id: customer.id, role: customer.role });
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
