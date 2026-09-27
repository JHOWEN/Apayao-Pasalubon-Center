-- AlterTable
ALTER TABLE "CustomerInquiry" ADD COLUMN     "imageUrls" TEXT,
ADD COLUMN     "replyImageUrls" TEXT;

-- CreateIndex
CREATE INDEX "CustomerInquiry_email_createdAt_idx" ON "CustomerInquiry"("email", "createdAt");
