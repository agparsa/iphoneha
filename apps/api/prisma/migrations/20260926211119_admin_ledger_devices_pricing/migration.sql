-- Admin release: IMEI registry, the store's own instalment ledger (contracts,
-- instalments, cheques, promissory notes, payments), phone and in-store orders,
-- price history and customer notes.
--
-- The trigram search index on "Product" is created by hand in
-- 20260920153800_constraints_and_search; Prisma does not know it, so it must
-- never be dropped here.

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('WEBSITE', 'PHONE', 'IN_STORE');

-- CreateEnum
CREATE TYPE "DeviceUnitStatus" AS ENUM ('IN_STOCK', 'SOLD', 'RETURNED', 'DEFECTIVE');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('IN_HAND', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'RETURNED');

-- CreateEnum
CREATE TYPE "SafteStatus" AS ENUM ('HELD', 'RETURNED', 'CLAIMED');

-- CreateEnum
CREATE TYPE "ManualPaymentChannel" AS ENUM ('CASH', 'POS', 'TRANSFER', 'CHEQUE', 'ONLINE');

-- AlterEnum (PostgreSQL 12+ adds enum values inside a transaction; nothing
-- below uses them, which is what that requires)
ALTER TYPE "PaymentMethod" ADD VALUE 'IN_STORE';
ALTER TYPE "PaymentMethod" ADD VALUE 'CHEQUE';
ALTER TYPE "PaymentMethod" ADD VALUE 'SAFTE';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'WEBSITE';

-- CreateTable
CREATE TABLE "DeviceUnit" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "imei2" TEXT,
    "serialNumber" TEXT,
    "status" "DeviceUnitStatus" NOT NULL DEFAULT 'IN_STOCK',
    "costPrice" BIGINT,
    "supplier" TEXT,
    "note" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT,
    "orderItemId" TEXT,
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentContract" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "method" "CreditMethod" NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT,
    "orderId" TEXT,
    "creditRequestId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "nationalId" TEXT,
    "customerAddress" TEXT,
    "guarantorName" TEXT,
    "guarantorPhone" TEXT,
    "guarantorNationalId" TEXT,
    "itemDescription" TEXT NOT NULL,
    "cashPrice" BIGINT NOT NULL,
    "downPayment" BIGINT NOT NULL,
    "financed" BIGINT NOT NULL,
    "markup" BIGINT NOT NULL,
    "totalPayable" BIGINT NOT NULL,
    "months" INTEGER NOT NULL,
    "monthlyFeePercent" DECIMAL(5,2),
    "contractDate" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "amount" BIGINT NOT NULL,
    "paidAmount" BIGINT NOT NULL DEFAULT 0,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cheque" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "installmentId" TEXT,
    "sayadId" TEXT NOT NULL,
    "serial" TEXT,
    "bankName" TEXT NOT NULL,
    "branch" TEXT,
    "drawerName" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "ChequeStatus" NOT NULL DEFAULT 'IN_HAND',
    "sayadConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "depositedAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cheque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromissoryNote" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "electronic" BOOLEAN NOT NULL DEFAULT false,
    "status" "SafteStatus" NOT NULL DEFAULT 'HELD',
    "dueDate" DATE,
    "returnedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromissoryNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentPayment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "installmentId" TEXT,
    "chequeId" TEXT,
    "amount" BIGINT NOT NULL,
    "channel" "ManualPaymentChannel" NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "recordedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallmentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "oldPrice" BIGINT NOT NULL,
    "newPrice" BIGINT NOT NULL,
    "oldCompareAt" BIGINT,
    "newCompareAt" BIGINT,
    "batchId" TEXT,
    "adminUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceUnit_imei_key" ON "DeviceUnit"("imei");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceUnit_imei2_key" ON "DeviceUnit"("imei2");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceUnit_serialNumber_key" ON "DeviceUnit"("serialNumber");

-- CreateIndex
CREATE INDEX "DeviceUnit_variantId_status_idx" ON "DeviceUnit"("variantId", "status");

-- CreateIndex
CREATE INDEX "DeviceUnit_orderItemId_idx" ON "DeviceUnit"("orderItemId");

-- CreateIndex
CREATE INDEX "DeviceUnit_status_receivedAt_idx" ON "DeviceUnit"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentContract_number_key" ON "InstallmentContract"("number");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentContract_orderId_key" ON "InstallmentContract"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentContract_creditRequestId_key" ON "InstallmentContract"("creditRequestId");

-- CreateIndex
CREATE INDEX "InstallmentContract_status_createdAt_idx" ON "InstallmentContract"("status", "createdAt");

-- CreateIndex
CREATE INDEX "InstallmentContract_customerPhone_idx" ON "InstallmentContract"("customerPhone");

-- CreateIndex
CREATE INDEX "InstallmentContract_userId_idx" ON "InstallmentContract"("userId");

-- CreateIndex
CREATE INDEX "Installment_status_dueDate_idx" ON "Installment"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Installment_contractId_index_key" ON "Installment"("contractId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "Cheque_installmentId_key" ON "Cheque"("installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Cheque_sayadId_key" ON "Cheque"("sayadId");

-- CreateIndex
CREATE INDEX "Cheque_status_dueDate_idx" ON "Cheque"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Cheque_contractId_idx" ON "Cheque"("contractId");

-- CreateIndex
CREATE INDEX "PromissoryNote_contractId_idx" ON "PromissoryNote"("contractId");

-- CreateIndex
CREATE INDEX "InstallmentPayment_contractId_paidAt_idx" ON "InstallmentPayment"("contractId", "paidAt");

-- CreateIndex
CREATE INDEX "InstallmentPayment_paidAt_idx" ON "InstallmentPayment"("paidAt");

-- CreateIndex
CREATE INDEX "PriceChange_variantId_createdAt_idx" ON "PriceChange"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "PriceChange_createdAt_idx" ON "PriceChange"("createdAt");

-- CreateIndex
CREATE INDEX "CustomerNote_userId_createdAt_idx" ON "CustomerNote"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_source_createdAt_idx" ON "Order"("source", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceUnit" ADD CONSTRAINT "DeviceUnit_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceUnit" ADD CONSTRAINT "DeviceUnit_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceUnit" ADD CONSTRAINT "DeviceUnit_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentContract" ADD CONSTRAINT "InstallmentContract_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentContract" ADD CONSTRAINT "InstallmentContract_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentContract" ADD CONSTRAINT "InstallmentContract_creditRequestId_fkey" FOREIGN KEY ("creditRequestId") REFERENCES "CreditRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentContract" ADD CONSTRAINT "InstallmentContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "InstallmentContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "InstallmentContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "Installment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromissoryNote" ADD CONSTRAINT "PromissoryNote_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "InstallmentContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPayment" ADD CONSTRAINT "InstallmentPayment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "InstallmentContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPayment" ADD CONSTRAINT "InstallmentPayment_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "Installment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPayment" ADD CONSTRAINT "InstallmentPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Checks Prisma cannot express ───────────────────────────────────────────

ALTER TABLE "DeviceUnit"
  ADD CONSTRAINT "DeviceUnit_imei_check" CHECK ("imei" ~ '^[0-9]{15}$'),
  ADD CONSTRAINT "DeviceUnit_imei2_check" CHECK ("imei2" IS NULL OR "imei2" ~ '^[0-9]{15}$'),
  ADD CONSTRAINT "DeviceUnit_cost_check" CHECK ("costPrice" IS NULL OR "costPrice" >= 0),
  ADD CONSTRAINT "DeviceUnit_sold_check" CHECK ("status" <> 'SOLD' OR "orderItemId" IS NOT NULL);

ALTER TABLE "InstallmentContract"
  ADD CONSTRAINT "InstallmentContract_amounts_check" CHECK (
    "cashPrice" >= 0 AND "downPayment" >= 0 AND "downPayment" <= "cashPrice"
    AND "financed" = "cashPrice" - "downPayment" AND "totalPayable" >= "downPayment"
  ),
  ADD CONSTRAINT "InstallmentContract_months_check" CHECK ("months" BETWEEN 1 AND 60);

ALTER TABLE "Installment"
  ADD CONSTRAINT "Installment_amounts_check" CHECK ("amount" > 0 AND "paidAmount" >= 0 AND "paidAmount" <= "amount"),
  ADD CONSTRAINT "Installment_index_check" CHECK ("index" >= 1);

ALTER TABLE "Cheque"
  ADD CONSTRAINT "Cheque_amount_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "Cheque_sayad_check" CHECK ("sayadId" ~ '^[0-9]{16}$');

ALTER TABLE "PromissoryNote" ADD CONSTRAINT "PromissoryNote_amount_check" CHECK ("amount" > 0);

ALTER TABLE "InstallmentPayment" ADD CONSTRAINT "InstallmentPayment_amount_check" CHECK ("amount" > 0);

ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_price_check" CHECK ("newPrice" >= 0 AND "oldPrice" >= 0);
