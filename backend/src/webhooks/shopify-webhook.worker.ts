import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ShopifyWebhookService } from './shopify-webhook.service';

@Injectable()
export class ShopifyWebhookWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private draining = false;

  constructor(private readonly webhooks: ShopifyWebhookService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.drain(), 500);
    this.timer.unref();
    void this.drain();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      for (let processed = 0; processed < 10; processed += 1) {
        if (!await this.webhooks.processNext()) break;
      }
    } finally {
      this.draining = false;
    }
  }
}
