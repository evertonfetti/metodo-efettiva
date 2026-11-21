-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PLAYBOOK', 'POP');

-- CreateEnum
CREATE TYPE "RevisionState" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('INTERNO', 'CLIENTE');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('DOCX', 'PDF', 'MD');

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "projectId" UUID,
    "processCode" TEXT,
    "type" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "currentRevisionId" UUID,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRevision" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "contentJson" JSONB NOT NULL,
    "structuredSourcesJson" JSONB NOT NULL,
    "state" "RevisionState" NOT NULL DEFAULT 'DRAFT',
    "generatedByAi" BOOLEAN NOT NULL DEFAULT false,
    "lockVersion" INTEGER NOT NULL DEFAULT 0,
    "contentHash" TEXT,
    "parentRevisionId" UUID,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DocumentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentExport" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "audience" "Audience" NOT NULL,
    "isDraft" BOOLEAN NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "jobId" UUID,
    "fileAssetId" UUID,
    "errorMessage" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DocumentExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_clientId_projectId_idx" ON "Document"("clientId", "projectId");

-- CreateIndex
CREATE INDEX "DocumentRevision_clientId_idx" ON "DocumentRevision"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentRevision_documentId_version_key" ON "DocumentRevision"("documentId", "version");

-- CreateIndex
CREATE INDEX "DocumentExport_clientId_documentId_idx" ON "DocumentExport"("clientId", "documentId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExport" ADD CONSTRAINT "DocumentExport_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExport" ADD CONSTRAINT "DocumentExport_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExport" ADD CONSTRAINT "DocumentExport_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExport" ADD CONSTRAINT "DocumentExport_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Imutabilidade (seção 0.2 / RF-083): revisão APPROVED/PUBLISHED não pode ter conteúdo,
-- fontes ou cliente alterados; só é permitido APPROVED → PUBLISHED. Alterações exigem nova revisão.
CREATE OR REPLACE FUNCTION efettiva_revision_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD."state" IN ('APPROVED', 'PUBLISHED') THEN
    IF NEW."contentJson" IS DISTINCT FROM OLD."contentJson"
       OR NEW."structuredSourcesJson" IS DISTINCT FROM OLD."structuredSourcesJson"
       OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
       OR NEW."documentId" IS DISTINCT FROM OLD."documentId"
       OR NEW."version" IS DISTINCT FROM OLD."version"
       OR NEW."contentHash" IS DISTINCT FROM OLD."contentHash"
       OR NOT (NEW."state" = OLD."state" OR (OLD."state" = 'APPROVED' AND NEW."state" = 'PUBLISHED')) THEN
      RAISE EXCEPTION 'REVISION_IMMUTABLE: revisão % aprovada é imutável', OLD."id" USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_revision_immutable
  BEFORE UPDATE ON "DocumentRevision"
  FOR EACH ROW EXECUTE FUNCTION efettiva_revision_immutable();
