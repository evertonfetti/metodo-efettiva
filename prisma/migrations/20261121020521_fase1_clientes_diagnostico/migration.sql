-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('INTERNO', 'CLIENTE');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SCALE_0_5', 'BOOLEAN', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'NUMBER', 'CURRENCY', 'PERCENT', 'DATE', 'TEXT');

-- CreateEnum
CREATE TYPE "RuleEffect" AS ENUM ('SHOW', 'HIDE');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'FINALIZED');

-- CreateEnum
CREATE TYPE "AnswerConfidence" AS ENUM ('VERIFIED', 'REPORTED', 'ESTIMATED');

-- CreateEnum
CREATE TYPE "FindingOrigin" AS ENUM ('RULE', 'CONSULTANT', 'AI_SUGGESTION');

-- CreateEnum
CREATE TYPE "FindingType" AS ENUM ('PROBLEM', 'OPPORTUNITY', 'RISK', 'DATA_GAP', 'STRENGTH');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('DETECTED', 'REVIEWED', 'APPROVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "dataProcessingNote" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientNote" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'INTERNO',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentTemplate" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "industry" TEXT NOT NULL DEFAULT 'GERAL',
    "status" "TemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentDomain" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "AssessmentDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "domainCode" TEXT NOT NULL,
    "questionCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "weight" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL,
    "optionsJson" JSONB,
    "guidance" TEXT,
    "allowUnknown" BOOLEAN NOT NULL DEFAULT true,
    "allowNotApplicable" BOOLEAN NOT NULL DEFAULT true,
    "allowEvidence" BOOLEAN NOT NULL DEFAULT true,
    "allowNotes" BOOLEAN NOT NULL DEFAULT true,
    "applicableByDefault" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentRule" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "targetQuestionId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "effect" "RuleEffect" NOT NULL,
    "conditionJson" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AssessmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "parentAssessmentId" UUID,
    "segment" TEXT NOT NULL,
    "periodStart" DATE,
    "periodEnd" DATE,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMPTZ(3),
    "finalizedBy" UUID,
    "snapshotJson" JSONB,
    "createdBy" UUID NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAnswer" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "valueJson" JSONB NOT NULL,
    "confidence" "AnswerConfidence" NOT NULL DEFAULT 'REPORTED',
    "respondent" TEXT,
    "source" TEXT,
    "notes" TEXT,
    "updatedBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AssessmentAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentEvidence" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "assessmentAnswerId" UUID NOT NULL,
    "fileAssetId" UUID,
    "note" TEXT,
    "url" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentScore" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "domainCode" TEXT NOT NULL,
    "weightedScore" DECIMAL(6,3),
    "answeredWeight" DECIMAL(10,2) NOT NULL,
    "applicableWeight" DECIMAL(10,2) NOT NULL,
    "unknownCount" INTEGER NOT NULL DEFAULT 0,
    "coverage" DECIMAL(6,4) NOT NULL,

    CONSTRAINT "AssessmentScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "assessmentId" UUID,
    "type" "FindingType" NOT NULL,
    "domainCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "origin" "FindingOrigin" NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'MEDIUM',
    "evidenceJson" JSONB,
    "ruleKey" TEXT,
    "status" "FindingStatus" NOT NULL DEFAULT 'DETECTED',
    "dismissReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientContact_clientId_idx" ON "ClientContact"("clientId");

-- CreateIndex
CREATE INDEX "ClientNote_clientId_createdAt_idx" ON "ClientNote"("clientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentTemplate_code_version_key" ON "AssessmentTemplate"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentDomain_templateId_code_key" ON "AssessmentDomain"("templateId", "code");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_templateId_domainCode_sortOrder_idx" ON "AssessmentQuestion"("templateId", "domainCode", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestion_templateId_questionCode_key" ON "AssessmentQuestion"("templateId", "questionCode");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentRule_templateId_code_key" ON "AssessmentRule"("templateId", "code");

-- CreateIndex
CREATE INDEX "Assessment_clientId_startedAt_idx" ON "Assessment"("clientId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_clientId_number_revision_key" ON "Assessment"("clientId", "number", "revision");

-- CreateIndex
CREATE INDEX "AssessmentAnswer_clientId_idx" ON "AssessmentAnswer"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAnswer_assessmentId_questionId_key" ON "AssessmentAnswer"("assessmentId", "questionId");

-- CreateIndex
CREATE INDEX "AssessmentEvidence_clientId_idx" ON "AssessmentEvidence"("clientId");

-- CreateIndex
CREATE INDEX "AssessmentScore_clientId_idx" ON "AssessmentScore"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentScore_assessmentId_domainCode_key" ON "AssessmentScore"("assessmentId", "domainCode");

-- CreateIndex
CREATE INDEX "Finding_clientId_status_idx" ON "Finding"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_assessmentId_ruleKey_key" ON "Finding"("assessmentId", "ruleKey");

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentDomain" ADD CONSTRAINT "AssessmentDomain_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AssessmentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AssessmentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentRule" ADD CONSTRAINT "AssessmentRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AssessmentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentRule" ADD CONSTRAINT "AssessmentRule_targetQuestionId_fkey" FOREIGN KEY ("targetQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AssessmentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_parentAssessmentId_fkey" FOREIGN KEY ("parentAssessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AssessmentQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentEvidence" ADD CONSTRAINT "AssessmentEvidence_assessmentAnswerId_fkey" FOREIGN KEY ("assessmentAnswerId") REFERENCES "AssessmentAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentEvidence" ADD CONSTRAINT "AssessmentEvidence_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScore" ADD CONSTRAINT "AssessmentScore_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
