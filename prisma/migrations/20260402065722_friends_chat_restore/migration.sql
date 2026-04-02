/*
  Warnings:

  - You are about to drop the column `receiverId` on the `FriendRequest` table. All the data in the column will be lost.
  - You are about to drop the column `senderId` on the `FriendRequest` table. All the data in the column will be lost.
  - The `status` column on the `FriendRequest` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `user1Id` on the `Friendship` table. All the data in the column will be lost.
  - You are about to drop the column `user2Id` on the `Friendship` table. All the data in the column will be lost.
  - Added the required column `fromId` to the `FriendRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `toId` to the `FriendRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `friendId` to the `Friendship` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Friendship` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "FriendRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "FriendRequest" DROP CONSTRAINT "FriendRequest_receiverId_fkey";

-- DropForeignKey
ALTER TABLE "FriendRequest" DROP CONSTRAINT "FriendRequest_senderId_fkey";

-- AlterTable
ALTER TABLE "FriendRequest" DROP COLUMN "receiverId",
DROP COLUMN "senderId",
ADD COLUMN     "fromId" TEXT NOT NULL,
ADD COLUMN     "toId" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "FriendRequestStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Friendship" DROP COLUMN "user1Id",
DROP COLUMN "user2Id",
ADD COLUMN     "friendId" TEXT NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL;

-- DropEnum
DROP TYPE "RequestStatus";

-- AddForeignKey
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
