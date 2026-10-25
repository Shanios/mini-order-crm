import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ShopifySyncAuthGuard } from './shopify-sync-auth.guard';
import { ShopifySyncService } from './shopify-sync.service';

@Controller('shopify')
export class ShopifyController {
  constructor(private readonly sync: ShopifySyncService) {}

  @Post('sync')
  @UseGuards(ShopifySyncAuthGuard)
  syncOrders() {
    return this.sync.syncOrders();
  }

  @Get('status')
  status() {
    return this.sync.status();
  }
}
