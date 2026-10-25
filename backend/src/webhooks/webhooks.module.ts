import { Module } from '@nestjs/common';
import { ShopifyModule } from '../shopify/shopify.module';
import { ShopifyWebhookController } from './shopify-webhook.controller';
import { ShopifyWebhookService } from './shopify-webhook.service';
import { ShopifyWebhookWorker } from './shopify-webhook.worker';

@Module({
  imports: [ShopifyModule],
  controllers: [ShopifyWebhookController],
  providers: [ShopifyWebhookService, ShopifyWebhookWorker],
})
export class WebhooksModule {}
