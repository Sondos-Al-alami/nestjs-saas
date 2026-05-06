-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE';
