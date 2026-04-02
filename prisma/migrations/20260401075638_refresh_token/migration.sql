-- AlterTable
ALTER TABLE "RefreshToken" ALTER COLUMN "expiresAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
