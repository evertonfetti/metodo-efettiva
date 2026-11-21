-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiDecision" AS ENUM ('PENDING', 'ACCEPTED', 'EDITED', 'REJECTED');

-- CreateTable
CREATE TABLE "AiGeneration" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "documentId" UUID,
    "revisionId" UUID,
    "sectionKey" TEXT,
    "taskType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "inputJson" JSONB NOT NULL,
    "evidenceRefsJson" JSONB NOT NULL DEFAULT '[]',
    "outputSchemaVersion" TEXT NOT NULL,
    "outputJson" JSONB,
    "validationJson" JSONB,
    "status" "AiGenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "decision" "AiDecision" NOT NULL DEFAULT 'PENDING',
    "decidedBy" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionNote" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "costEstimate" DECIMAL(10,4),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "jobId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AiGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiGeneration_clientId_documentId_createdAt_idx" ON "AiGeneration"("clientId", "documentId", "createdAt");

-- CreateIndex
CREATE INDEX "AiGeneration_actorUserId_createdAt_idx" ON "AiGeneration"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
