import { Controller, Get } from '@nestjs/common';
import { ShopStatusService } from './shop-status.service';

@Controller('shops')
export class ShopStatusController {
  constructor(private readonly shopStatusService: ShopStatusService) {}

  @Get('status')
  listConnections() {
    return this.shopStatusService.listConnections();
  }
}
