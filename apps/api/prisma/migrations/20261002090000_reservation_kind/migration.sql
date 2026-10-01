-- CreateEnum
CREATE TYPE "ReservationKind" AS ENUM ('STAY', 'BLOCK');

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN "kind" "ReservationKind" NOT NULL DEFAULT 'STAY';
