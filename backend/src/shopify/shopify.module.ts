import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ShopifyController } from './shopify.controller';
import { ShopifyCatalogController } from './shopify-catalog.controller';
import { ShopifyAdminApiService } from './shopify-admin-api.service';
import { ShopifyConfigService } from './shopify-config.service';
import { shopifyFetchProvider } from './shopify-fetch';
import { ShopifyOrderImportService } from './shopify-order-import.service';
import { ShopifySyncAuthGuard } from './shopify-sync-auth.guard';
import { ShopifySyncService } from './shopify-sync.service';
import { OrderCreateAuthGuard } from './order-create-auth.guard';
import { ShopifyTokenService } from './shopify-token.service';
import { ShopStatusController } from './shop-status.controller';
import { ShopStatusService } from './shop-status.service';

@Module({
  imports: [AuthModule],
  controllers: [ShopStatusController, ShopifyController, ShopifyCatalogController],
  providers: [
    ShopStatusService,
    ShopifyConfigService,
    ShopifyTokenService,
    ShopifyAdminApiService,
    ShopifyOrderImportService,
    ShopifySyncService,
    ShopifySyncAuthGuard,
    OrderCreateAuthGuard,
    shopifyFetchProvider,
  ],
  exports: [ShopifyConfigService, ShopifyAdminApiService, ShopifyOrderImportService, OrderCreateAuthGuard],
})
export class ShopifyModule {}
