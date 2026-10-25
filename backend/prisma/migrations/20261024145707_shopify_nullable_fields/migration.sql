-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "firstName" DROP NOT NULL,
ALTER COLUMN "lastName" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "financialStatus" DROP NOT NULL;
