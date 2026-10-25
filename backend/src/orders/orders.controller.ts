import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { OrderCreateAuthGuard } from '../shopify/order-create-auth.guard';
import { OrderCreationService } from './order-creation.service';
import { OrdersService } from './orders.service';
import { OperatorCsrfGuard } from '../auth/operator-csrf.guard';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService, private readonly creation: OrderCreationService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.ordersService.list(ListOrdersQueryDto.fromQuery(query));
  }

  @Get(':id')
  findById(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.ordersService.findById(id);
  }

  @Post()
  @UseGuards(OrderCreateAuthGuard, OperatorCsrfGuard)
  create(@Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.creation.create(body, idempotencyKey);
  }

  @Get('creation-requests/:key')
  @UseGuards(OrderCreateAuthGuard)
  creationStatus(@Param('key') key: string) {
    return this.creation.status(key);
  }
}
