import { Prisma, PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import bcrypt from "bcryptjs";

loadEnvConfig(process.cwd());

function requireInput(value: string | undefined, variable: string) {
  const normalized = value?.trim();
  if (!normalized)
    throw new Error(`Set ${variable} before running this setup command.`);
  return normalized;
}

function requirePassword() {
  const value = process.env.INITIAL_ADMIN_PASSWORD;
  if (!value)
    throw new Error(
      "Set INITIAL_ADMIN_PASSWORD before running this setup command.",
    );
  return value;
}

const confirmation = requireInput(
  process.env.INITIAL_ADMIN_CONFIRMATION,
  "INITIAL_ADMIN_CONFIRMATION",
);
const name = requireInput(process.env.INITIAL_ADMIN_NAME, "INITIAL_ADMIN_NAME");
const email = requireInput(
  process.env.INITIAL_ADMIN_EMAIL,
  "INITIAL_ADMIN_EMAIL",
).toLowerCase();
const password = requirePassword();

if (confirmation !== "CREATE_FIRST_ADMIN") {
  throw new Error(
    "Set INITIAL_ADMIN_CONFIRMATION=CREATE_FIRST_ADMIN to run this one-time setup.",
  );
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("INITIAL_ADMIN_EMAIL must be a valid email address.");
}

if (
  Array.from(password).length < 16 ||
  Buffer.byteLength(password, "utf8") > 72
) {
  throw new Error(
    "Use an initial admin password of 16 or more characters and no more than 72 UTF-8 bytes.",
  );
}

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash(password, 12);

  const admin = await prisma.$transaction(
    async (transaction) => {
      const existingAdminCount = await transaction.user.count({
        where: { role: "ADMIN" },
      });
      if (existingAdminCount > 0) {
        throw new Error(
          "An admin account already exists. This setup command only provisions the first admin.",
        );
      }

      return transaction.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "ADMIN",
          emailVerified: true,
        },
        select: { id: true, email: true },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  console.log(`Initial admin created for ${admin.email} (id: ${admin.id}).`);
}

main()
  .catch((error) => {
    console.error(
      "Unable to provision the initial admin:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
