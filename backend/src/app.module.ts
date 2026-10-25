import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { OrdersModule } from './orders/orders.module';
import { ShopifyModule } from './shopify/shopify.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [PrismaModule, HealthModule, OrdersModule, ShopifyModule, WebhooksModule],
})
export class AppModule {}
