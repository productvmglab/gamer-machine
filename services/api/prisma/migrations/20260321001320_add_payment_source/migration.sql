-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('pix', 'admin');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "source" "PaymentSource" NOT NULL DEFAULT 'pix';
