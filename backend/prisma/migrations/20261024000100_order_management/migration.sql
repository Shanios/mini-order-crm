-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "shop_connections" (
    "id" UUID NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shop_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "shopifyCustomerId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" UUID,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "financialStatus" TEXT NOT NULL,
    "fulfillmentStatus" TEXT NOT NULL,
    "totalAmount" DECIMAL(20,4) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "orderDate" TIMESTAMPTZ(6) NOT NULL,
    "cancelledAt" TIMESTAMPTZ(6),
    "shopifyUpdatedAt" TIMESTAMPTZ(6) NOT NULL,
    "syncedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "shopifyLineItemId" TEXT NOT NULL,
    "shopifyProductId" TEXT,
    "shopifyVariantId" TEXT,
    "title" TEXT NOT NULL,
    "variantTitle" TEXT,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(20,4) NOT NULL,
    "totalPrice" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "eventId" TEXT,
    "topic" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(6),
    "errorMessage" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_connections_shopDomain_key" ON "shop_connections"("shopDomain");

-- CreateIndex
CREATE INDEX "customers_shopId_email_idx" ON "customers"("shopId", "email");

-- CreateIndex
CREATE INDEX "customers_shopId_displayName_idx" ON "customers"("shopId", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "customers_shopId_shopifyCustomerId_key" ON "customers"("shopId", "shopifyCustomerId");

-- CreateIndex
CREATE INDEX "orders_shopId_orderDate_idx" ON "orders"("shopId", "orderDate" DESC);

-- CreateIndex
CREATE INDEX "orders_shopId_financialStatus_orderDate_idx" ON "orders"("shopId", "financialStatus", "orderDate" DESC);

-- CreateIndex
CREATE INDEX "orders_shopId_fulfillmentStatus_orderDate_idx" ON "orders"("shopId", "fulfillmentStatus", "orderDate" DESC);

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- CreateIndex
CREATE INDEX "orders_shopId_orderNumber_idx" ON "orders"("shopId", "orderNumber");

-- CreateIndex
CREATE INDEX "orders_shopId_customerName_idx" ON "orders"("shopId", "customerName");

-- CreateIndex
CREATE INDEX "orders_shopId_customerEmail_idx" ON "orders"("shopId", "customerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "orders_shopId_shopifyOrderId_key" ON "orders"("shopId", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_shopifyProductId_idx" ON "order_items"("shopifyProductId");

-- CreateIndex
CREATE INDEX "order_items_shopifyVariantId_idx" ON "order_items"("shopifyVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_orderId_shopifyLineItemId_key" ON "order_items"("orderId", "shopifyLineItemId");

-- CreateIndex
CREATE INDEX "webhook_events_shopId_status_receivedAt_idx" ON "webhook_events"("shopId", "status", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "webhook_events_shopId_topic_receivedAt_idx" ON "webhook_events"("shopId", "topic", "receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_shopId_deliveryId_key" ON "webhook_events"("shopId", "deliveryId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shop_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shop_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shop_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
