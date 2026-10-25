import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ShopifyModule } from '../shopify/shopify.module';
import { OrdersController } from './orders.controller';
import { OrderCreationService } from './order-creation.service';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, ShopifyModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderCreationService],
})
export class OrdersModule {}
