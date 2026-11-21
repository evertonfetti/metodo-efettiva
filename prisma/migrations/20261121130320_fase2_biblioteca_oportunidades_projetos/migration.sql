-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('DETECTED', 'REVIEWED', 'APPROVED', 'DISMISSED', 'LINKED_TO_PROJECT');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'APPROVED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectProcessStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'PILOT', 'ACTIVE', 'VALIDATED', 'SUSTAINED', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "ProcessDefinition" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "domainCode" TEXT NOT NULL,
    "domainName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "seedStatus" TEXT NOT NULL DEFAULT 'BASIC',
    "hasFullSheet" BOOLEAN NOT NULL DEFAULT false,
    "contentJson" JSONB,
    "industryTagsJson" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "baseVersion" INTEGER NOT NULL DEFAULT 1,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "customized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProcessDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessRevision" (
    "id" UUID NOT NULL,
    "processDefinitionId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "changeNotes" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SEED',
    "changedBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "findingId" UUID,
    "projectId" UUID,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "expectedOutcome" TEXT,
    "domainCode" TEXT NOT NULL,
    "origin" "FindingOrigin" NOT NULL,
    "impactScore" INTEGER NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "effortScore" INTEGER NOT NULL,
    "priorityScore" DECIMAL(5,2) NOT NULL,
    "criticalRisk" BOOLEAN NOT NULL DEFAULT false,
    "criticalRiskReason" TEXT,
    "urgency" INTEGER,
    "dependency" TEXT,
    "costEstimate" DECIMAL(14,2),
    "timeToImpact" TEXT,
    "consultantOverrideReason" TEXT,
    "estimatedValue" DECIMAL(14,2),
    "estimateType" TEXT,
    "assumptionsJson" JSONB NOT NULL DEFAULT '[]',
    "evidenceJson" JSONB NOT NULL DEFAULT '[]',
    "missingData" TEXT,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'DETECTED',
    "statusReason" TEXT,
    "reviewerId" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "approvedAt" TIMESTAMPTZ(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityProcess" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "processDefinitionId" UUID NOT NULL,
    "rationale" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "suggested" BOOLEAN NOT NULL DEFAULT false,
    "selectedBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT,
    "objectivesJson" JSONB NOT NULL DEFAULT '[]',
    "startDate" DATE NOT NULL,
    "targetDate" DATE NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerUserId" UUID NOT NULL,
    "sponsorName" TEXT,
    "baselineLockedAt" TIMESTAMPTZ(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectProcess" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "processDefinitionId" UUID NOT NULL,
    "processVersion" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "status" "ProjectProcessStatus" NOT NULL DEFAULT 'PLANNED',
    "statusReason" TEXT,
    "ownerName" TEXT,
    "successCriteriaJson" JSONB NOT NULL DEFAULT '[]',
    "validationJson" JSONB,
    "startDate" DATE,
    "targetDate" DATE,
    "validatedAt" TIMESTAMPTZ(3),
    "sustainedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProjectProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionTask" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "projectProcessId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeUserId" UUID,
    "externalOwnerName" TEXT,
    "dueDate" DATE,
    "window" INTEGER,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "checklistJson" JSONB NOT NULL DEFAULT '[]',
    "blockedReason" TEXT,
    "notes" TEXT,
    "planKey" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "createdBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ActionTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionEvidence" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "actionTaskId" UUID,
    "projectProcessId" UUID,
    "fileAssetId" UUID,
    "text" TEXT,
    "url" TEXT,
    "authorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessDefinition_code_key" ON "ProcessDefinition"("code");

-- CreateIndex
CREATE INDEX "ProcessDefinition_domainCode_idx" ON "ProcessDefinition"("domainCode");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessRevision_processDefinitionId_version_key" ON "ProcessRevision"("processDefinitionId", "version");

-- CreateIndex
CREATE INDEX "Opportunity_clientId_status_idx" ON "Opportunity"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_clientId_number_key" ON "Opportunity"("clientId", "number");

-- CreateIndex
CREATE INDEX "OpportunityProcess_clientId_idx" ON "OpportunityProcess"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityProcess_opportunityId_processDefinitionId_key" ON "OpportunityProcess"("opportunityId", "processDefinitionId");

-- CreateIndex
CREATE INDEX "Project_clientId_status_idx" ON "Project"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Project_clientId_number_key" ON "Project"("clientId", "number");

-- CreateIndex
CREATE INDEX "ProjectProcess_clientId_idx" ON "ProjectProcess"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectProcess_projectId_processDefinitionId_key" ON "ProjectProcess"("projectId", "processDefinitionId");

-- CreateIndex
CREATE INDEX "ActionTask_clientId_projectId_status_idx" ON "ActionTask"("clientId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ActionTask_projectId_planKey_key" ON "ActionTask"("projectId", "planKey");

-- CreateIndex
CREATE INDEX "ActionEvidence_clientId_idx" ON "ActionEvidence"("clientId");

-- AddForeignKey
ALTER TABLE "ProcessRevision" ADD CONSTRAINT "ProcessRevision_processDefinitionId_fkey" FOREIGN KEY ("processDefinitionId") REFERENCES "ProcessDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityProcess" ADD CONSTRAINT "OpportunityProcess_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityProcess" ADD CONSTRAINT "OpportunityProcess_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityProcess" ADD CONSTRAINT "OpportunityProcess_processDefinitionId_fkey" FOREIGN KEY ("processDefinitionId") REFERENCES "ProcessDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProcess" ADD CONSTRAINT "ProjectProcess_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProcess" ADD CONSTRAINT "ProjectProcess_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProcess" ADD CONSTRAINT "ProjectProcess_processDefinitionId_fkey" FOREIGN KEY ("processDefinitionId") REFERENCES "ProcessDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTask" ADD CONSTRAINT "ActionTask_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTask" ADD CONSTRAINT "ActionTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTask" ADD CONSTRAINT "ActionTask_projectProcessId_fkey" FOREIGN KEY ("projectProcessId") REFERENCES "ProjectProcess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTask" ADD CONSTRAINT "ActionTask_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionEvidence" ADD CONSTRAINT "ActionEvidence_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionEvidence" ADD CONSTRAINT "ActionEvidence_actionTaskId_fkey" FOREIGN KEY ("actionTaskId") REFERENCES "ActionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionEvidence" ADD CONSTRAINT "ActionEvidence_projectProcessId_fkey" FOREIGN KEY ("projectProcessId") REFERENCES "ProjectProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionEvidence" ADD CONSTRAINT "ActionEvidence_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
