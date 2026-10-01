-- AlterTable
ALTER TABLE "units" ADD COLUMN "export_token" TEXT,
ADD COLUMN "export_token_created_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "units_export_token_key" ON "units"("export_token");
