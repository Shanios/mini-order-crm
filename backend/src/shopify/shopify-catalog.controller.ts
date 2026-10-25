import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OrderCreateAuthGuard } from './order-create-auth.guard';
import { ShopifyAdminApiService } from './shopify-admin-api.service';

@Controller('shopify')
export class ShopifyCatalogController {
  constructor(private readonly adminApi: ShopifyAdminApiService) {}

  @Get('products')
  async products(@Query() query: Record<string, unknown>) {
    const search = parseSearch(query.search, true);
    const first = parseFirst(query.first);
    const after = parseCursor(query.after);
    const result = await this.adminApi.searchProductVariants(search, first, after);
    return {
      data: result.nodes.map((variant) => ({
        id: variant.id,
        title: variant.product?.title ?? 'Unavailable product',
        productId: variant.product?.id ?? null,
        productStatus: variant.product?.status ?? null,
        variantId: variant.id,
        variantTitle: variant.title,
        sku: variant.sku,
        price: variant.price,
        currencyCode: result.currencyCode,
        available: variant.availableForSale && variant.product?.status === 'ACTIVE',
        selectedOptions: variant.selectedOptions,
      })),
      pageInfo: result.pageInfo,
    };
  }

  @Get('customers')
  @UseGuards(OrderCreateAuthGuard)
  async customers(@Query() query: Record<string, unknown>) {
    const search = parseSearch(query.search, false);
    const first = parseFirst(query.first, 25);
    const after = parseCursor(query.after);
    return { data: await this.adminApi.searchCustomers(search, first, after) };
  }
}

function parseSearch(value: unknown, optional: boolean): string {
  if (value === undefined && optional) return '';
  if (typeof value !== 'string') throw new BadRequestException('The search parameter must be text.');
  const search = value.trim();
  if ((!optional && search.length < 2) || search.length > 100) {
    throw new BadRequestException('Search must contain 2 to 100 characters.');
  }
  return search;
}

function parseFirst(value: unknown, defaultValue = 50): number {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new BadRequestException('The first parameter must be an integer from 1 to 100.');
  }
  return parsed;
}

function parseCursor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value || value.length > 2048) {
    throw new BadRequestException('The after parameter must be a valid Shopify pagination cursor.');
  }
  return value;
}
