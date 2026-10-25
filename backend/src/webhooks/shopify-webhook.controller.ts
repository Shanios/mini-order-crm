import { BadRequestException, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ShopifyWebhookService } from './shopify-webhook.service';

@Controller('webhooks/shopify')
export class ShopifyWebhookController {
  constructor(private readonly webhooks: ShopifyWebhookService) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    if (!request.rawBody) throw new BadRequestException('Raw webhook body is unavailable.');
    return this.webhooks.accept({
      rawBody: request.rawBody,
      signature: header(headers, 'x-shopify-hmac-sha256'),
      shopDomain: header(headers, 'x-shopify-shop-domain'),
      topic: header(headers, 'x-shopify-topic'),
      deliveryId: header(headers, 'x-shopify-webhook-id'),
      eventId: header(headers, 'x-shopify-event-id') ?? null,
    });
  }
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
