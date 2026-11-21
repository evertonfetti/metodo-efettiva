-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('CUSTOMERS', 'PRODUCTS', 'SALES', 'SALE_ITEMS', 'QUOTES');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'MAPPED', 'VALIDATED', 'IMPORTING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "SaleKind" AS ENUM ('ORDER', 'INVOICE');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('VALID', 'CANCELLED', 'RETURN');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'EXPIRED');

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "type" "ImportType" NOT NULL,
    "fileAssetId" UUID NOT NULL,
    "originalName" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "recordKind" "SaleKind",
    "sheetName" TEXT,
    "headersJson" JSONB NOT NULL DEFAULT '[]',
    "mappingJson" JSONB,
    "summaryJson" JSONB,
    "previewJson" JSONB,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "acceptedRows" INTEGER NOT NULL DEFAULT 0,
    "rejectedRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "unchangedRows" INTEGER NOT NULL DEFAULT 0,
    "errorFileAssetId" UUID,
    "sourceValidated" BOOLEAN NOT NULL DEFAULT false,
    "jobId" UUID,
    "errorMessage" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRowError" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "field" TEXT,
    "reason" TEXT NOT NULL,
    "rawValueSafe" TEXT,

    CONSTRAINT "ImportRowError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportMappingProfile" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "type" "ImportType" NOT NULL,
    "mappingJson" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ImportMappingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" TEXT,
    "sellerRef" TEXT,
    "active" BOOLEAN,
    "typicalIntervalDays" INTEGER,
    "rowHash" TEXT NOT NULL,
    "batchId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "active" BOOLEAN,
    "rowHash" TEXT NOT NULL,
    "batchId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "occurredAt" DATE NOT NULL,
    "recordKind" "SaleKind" NOT NULL,
    "status" "SaleStatus" NOT NULL,
    "statusRaw" TEXT NOT NULL,
    "grossAmount" DECIMAL(14,2),
    "discounts" DECIMAL(14,2),
    "deductions" DECIMAL(14,2),
    "netAmount" DECIMAL(14,2) NOT NULL,
    "netDerived" BOOLEAN NOT NULL DEFAULT false,
    "sellerRef" TEXT,
    "rowHash" TEXT NOT NULL,
    "batchId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "productId" UUID,
    "externalLineId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitPrice" DECIMAL(14,4) NOT NULL,
    "discount" DECIMAL(14,2),
    "unitVariableCost" DECIMAL(14,4),
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "variableCostTotal" DECIMAL(14,2),
    "rowHash" TEXT NOT NULL,
    "batchId" UUID NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "issuedAt" DATE NOT NULL,
    "validUntil" DATE,
    "status" "QuoteStatus" NOT NULL,
    "statusRaw" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "ownerRef" TEXT,
    "lastInteractionAt" DATE,
    "lostReason" TEXT,
    "rowHash" TEXT NOT NULL,
    "batchId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "projectId" UUID,
    "metricCode" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "valueDecimal" DECIMAL(18,4),
    "unit" TEXT NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "sourceJson" JSONB NOT NULL,
    "inputQuality" TEXT NOT NULL,
    "unavailableReason" TEXT,
    "recordedBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportBatch_clientId_type_createdAt_idx" ON "ImportBatch"("clientId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "ImportRowError_batchId_rowNumber_idx" ON "ImportRowError"("batchId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ImportMappingProfile_clientId_type_key" ON "ImportMappingProfile"("clientId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_clientId_externalId_key" ON "Customer"("clientId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_clientId_externalId_key" ON "Product"("clientId", "externalId");

-- CreateIndex
CREATE INDEX "Sale_clientId_occurredAt_status_idx" ON "Sale"("clientId", "occurredAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_clientId_sourceSystem_externalId_key" ON "Sale"("clientId", "sourceSystem", "externalId");

-- CreateIndex
CREATE INDEX "SaleItem_clientId_idx" ON "SaleItem"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleItem_saleId_externalLineId_key" ON "SaleItem"("saleId", "externalLineId");

-- CreateIndex
CREATE INDEX "Quote_clientId_status_issuedAt_idx" ON "Quote"("clientId", "status", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_clientId_sourceSystem_externalId_key" ON "Quote"("clientId", "sourceSystem", "externalId");

-- CreateIndex
CREATE INDEX "MetricSnapshot_clientId_metricCode_periodStart_idx" ON "MetricSnapshot"("clientId", "metricCode", "periodStart");

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRowError" ADD CONSTRAINT "ImportRowError_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRowError" ADD CONSTRAINT "ImportRowError_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportMappingProfile" ADD CONSTRAINT "ImportMappingProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
