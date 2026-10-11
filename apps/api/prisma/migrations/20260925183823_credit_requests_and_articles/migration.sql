-- Instalment requests with a cheque or promissory note, and the magazine.
-- (The trigram search index on "Product"."searchText" lives outside the
-- Prisma schema — see 20260920153800 — and must not be dropped here.)

-- CreateEnum
CREATE TYPE "CreditMethod" AS ENUM ('CHEQUE', 'SAFTE');

-- CreateEnum
CREATE TYPE "CreditRequestStatus" AS ENUM ('NEW', 'CONTACTED', 'CONTRACTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "CreditRequest" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT,
    "method" "CreditMethod" NOT NULL,
    "productId" TEXT,
    "productName" TEXT,
    "months" INTEGER,
    "note" TEXT,
    "source" TEXT,
    "status" "CreditRequestStatus" NOT NULL DEFAULT 'NEW',
    "adminNote" TEXT,
    "userId" TEXT,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "coverUrl" TEXT,
    "coverAlt" TEXT,
    "coverKey" TEXT,
    "seoTitle" TEXT,
    "focusKeyword" TEXT,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditRequest_number_key" ON "CreditRequest"("number");

-- CreateIndex
CREATE INDEX "CreditRequest_status_createdAt_idx" ON "CreditRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CreditRequest_phone_createdAt_idx" ON "CreditRequest"("phone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_status_publishedAt_idx" ON "Article"("status", "publishedAt");

-- AddForeignKey
ALTER TABLE "CreditRequest" ADD CONSTRAINT "CreditRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditRequest" ADD CONSTRAINT "CreditRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditRequest" ADD CONSTRAINT "CreditRequest_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
