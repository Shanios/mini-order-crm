const { PrismaClient } = require('@prisma/client');

async function checkDatabase() {
  const prisma = new PrismaClient();

  try {
    await prisma.$queryRaw`SELECT 1`;
    process.stdout.write('Database connection OK.\n');
  } catch {
    process.stderr.write('Database connection failed; details withheld to protect credentials.\n');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void checkDatabase();
