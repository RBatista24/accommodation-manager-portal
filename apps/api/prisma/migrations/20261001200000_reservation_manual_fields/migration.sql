-- AlterTable
ALTER TABLE "reservations" ADD COLUMN "manual_fields" TEXT[] DEFAULT ARRAY[]::TEXT[];
