import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding users...');

  const adminPassword = await bcrypt.hash('admin12345', 10);
  const customerPassword = await bcrypt.hash('customer12345', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@apc-inventory.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@apc-inventory.com',
      password: adminPassword,
      role: 'ADMIN',
      phone: '1234567890',
      address: '123 Admin Street',
      emailVerified: true,
      isBlocked: false,
    },
  });

  console.log('✅ Admin created:', { id: admin.id, email: admin.email, role: admin.role });

  const customer = await prisma.user.upsert({
    where: { email: 'customer@gmail.com' },
    update: {},
    create: {
      name: 'Customer User',
      email: 'customer@gmail.com',
      password: customerPassword,
      role: 'CUSTOMER',
      phone: '0987654321',
      address: '456 Customer Avenue',
      emailVerified: true,
      isBlocked: false,
    },
  });

  console.log('✅ Customer created:', { id: customer.id, email: customer.email, role: customer.role });
  console.log('\n📝 Login credentials:');
  console.log('Admin:    admin@apc-inventory.com / Admin12345');
  console.log('Customer: customer@gmail.com / Customer12345');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
