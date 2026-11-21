-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'REPORT';

-- CreateTable
CREATE TABLE "ProjectBaseline" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "metricCode" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "valueDecimal" DECIMAL(18,4),
    "unavailableReason" TEXT,
    "calculationVersion" TEXT NOT NULL,
    "sourceJson" JSONB NOT NULL,
    "revisionReason" TEXT,
    "lockedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedBy" UUID NOT NULL,

    CONSTRAINT "ProjectBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMeeting" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "occurredAt" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "attendeesJson" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL,
    "decisionsJson" JSONB NOT NULL DEFAULT '[]',
    "nextStepsJson" JSONB NOT NULL DEFAULT '[]',
    "impedimentsJson" JSONB NOT NULL DEFAULT '[]',
    "trainingsJson" JSONB NOT NULL DEFAULT '[]',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectEvent" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "occurredAt" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessAudit" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "projectProcessId" UUID NOT NULL,
    "auditedAt" DATE NOT NULL,
    "itemsChecked" INTEGER NOT NULL,
    "itemsConforming" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportPeriod" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "documentId" UUID,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectBaseline_clientId_idx" ON "ProjectBaseline"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBaseline_projectId_metricCode_revision_key" ON "ProjectBaseline"("projectId", "metricCode", "revision");

-- CreateIndex
CREATE INDEX "ProjectMeeting_clientId_projectId_occurredAt_idx" ON "ProjectMeeting"("clientId", "projectId", "occurredAt");

-- CreateIndex
CREATE INDEX "ProjectEvent_clientId_projectId_idx" ON "ProjectEvent"("clientId", "projectId");

-- CreateIndex
CREATE INDEX "ProcessAudit_clientId_projectProcessId_idx" ON "ProcessAudit"("clientId", "projectProcessId");

-- CreateIndex
CREATE INDEX "ReportPeriod_clientId_projectId_idx" ON "ReportPeriod"("clientId", "projectId");

-- AddForeignKey
ALTER TABLE "ProjectBaseline" ADD CONSTRAINT "ProjectBaseline_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBaseline" ADD CONSTRAINT "ProjectBaseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMeeting" ADD CONSTRAINT "ProjectMeeting_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMeeting" ADD CONSTRAINT "ProjectMeeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessAudit" ADD CONSTRAINT "ProcessAudit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessAudit" ADD CONSTRAINT "ProcessAudit_projectProcessId_fkey" FOREIGN KEY ("projectProcessId") REFERENCES "ProjectProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPeriod" ADD CONSTRAINT "ReportPeriod_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPeriod" ADD CONSTRAINT "ReportPeriod_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Baseline congelado não muda: correção só por nova revisão (RF-101, 7.4).
CREATE OR REPLACE FUNCTION efettiva_baseline_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'BASELINE_IMMUTABLE: baseline % congelado; registre uma nova revisão', OLD."id" USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_baseline_immutable
  BEFORE UPDATE ON "ProjectBaseline"
  FOR EACH ROW EXECUTE FUNCTION efettiva_baseline_immutable();
