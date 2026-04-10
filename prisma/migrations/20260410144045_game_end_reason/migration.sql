-- CreateEnum
CREATE TYPE "GameEndReason" AS ENUM ('CHECKMATE', 'STALEMATE', 'TIMEOUT', 'RESIGNATION', 'ABANDONED');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "endReason" "GameEndReason";
