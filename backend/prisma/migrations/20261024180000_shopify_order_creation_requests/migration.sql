CREATE TABLE "order_creation_requests" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "shopifyOrderId" TEXT,
    "orderId" UUID,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_creation_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_creation_requests_shopId_idempotencyKey_key"
    ON "order_creation_requests"("shopId", "idempotencyKey");

CREATE UNIQUE INDEX "order_creation_requests_orderId_key"
    ON "order_creation_requests"("orderId");

CREATE INDEX "order_creation_requests_shopId_status_createdAt_idx"
    ON "order_creation_requests"("shopId", "status", "createdAt" DESC);

ALTER TABLE "order_creation_requests"
    ADD CONSTRAINT "order_creation_requests_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "shop_connections"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_creation_requests"
    ADD CONSTRAINT "order_creation_requests_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
