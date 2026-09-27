-- Set status default to PENDING_PAYMENT after enum value is committed
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';
