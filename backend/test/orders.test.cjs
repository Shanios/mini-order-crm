const assert = require('node:assert/strict');
const { test } = require('node:test');
const { BadRequestException, NotFoundException, ParseUUIDPipe } = require('@nestjs/common');
const { ListOrdersQueryDto } = require('../dist/orders/dto/list-orders-query.dto.js');
const { OrdersService } = require('../dist/orders/orders.service.js');

function createService({ findMany = [], count = 0, findUnique = null } = {}) {
  const calls = { findMany: [], count: [], findUnique: [] };
  const prisma = {
    order: {
      findMany: async (args) => {
        calls.findMany.push(args);
        return findMany;
      },
      count: async (args) => {
        calls.count.push(args);
        return count;
      },
      findUnique: async (args) => {
        calls.findUnique.push(args);
        return findUnique;
      },
    },
  };
  return { service: new OrdersService(prisma), calls };
}

test('lists orders with pagination metadata and default newest sorting', async () => {
  const orders = [{ id: 'order-1' }];
  const { service, calls } = createService({ findMany: orders, count: 21 });

  const result = await service.list(ListOrdersQueryDto.fromQuery({ page: '2', pageSize: '5' }));

  assert.deepEqual(result, {
    data: orders,
    meta: { page: 2, pageSize: 5, total: 21, totalPages: 5 },
  });
  assert.equal(calls.findMany[0].skip, 5);
  assert.equal(calls.findMany[0].take, 5);
  assert.deepEqual(calls.findMany[0].orderBy, [{ orderDate: 'desc' }, { id: 'asc' }]);
  assert.equal(calls.count[0].where, calls.findMany[0].where);
});

test('searches across order number and customer fields and applies filters', async () => {
  const { service, calls } = createService();
  const query = ListOrdersQueryDto.fromQuery({
    search: '  jane@example.com ',
    financialStatus: 'PAID',
    fulfillmentStatus: 'FULFILLED',
    dateFrom: '2026-10-01',
    dateTo: '2026-10-31',
    sort: 'oldest',
  });

  await service.list(query);

  const { where, orderBy } = calls.findMany[0];
  assert.deepEqual(where.OR, [
    { orderNumber: { contains: 'jane@example.com', mode: 'insensitive' } },
    { customerName: { contains: 'jane@example.com', mode: 'insensitive' } },
    { customerEmail: { contains: 'jane@example.com', mode: 'insensitive' } },
  ]);
  assert.equal(where.financialStatus, 'PAID');
  assert.equal(where.fulfillmentStatus, 'FULFILLED');
  assert.equal(where.orderDate.gte.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(where.orderDate.lte.toISOString(), '2026-10-31T23:59:59.999Z');
  assert.deepEqual(orderBy, [{ orderDate: 'asc' }, { id: 'asc' }]);
});

test('returns order details with customer and line items', async () => {
  const order = { id: '8b46fd23-720b-4c30-9a6d-f0c245d41717', items: [], customer: null };
  const { service, calls } = createService({ findUnique: order });

  const result = await service.findById(order.id);

  assert.deepEqual(result, { data: order });
  assert.deepEqual(calls.findUnique[0], {
    where: { id: order.id },
    include: { customer: true, items: { orderBy: { id: 'asc' } } },
  });
});

test('returns not found for an unknown order', async () => {
  const { service } = createService({ findUnique: null });
  await assert.rejects(
    service.findById('8b46fd23-720b-4c30-9a6d-f0c245d41717'),
    NotFoundException,
  );
});

test('rejects invalid, out-of-range, and unknown list query parameters', () => {
  for (const query of [
    { page: '0' },
    { pageSize: '101' },
    { sort: 'random' },
    { dateFrom: 'not-a-date' },
    { dateFrom: '2026-11-01', dateTo: '2026-10-01' },
    { unexpected: 'value' },
  ]) {
    assert.throws(() => ListOrdersQueryDto.fromQuery(query), BadRequestException);
  }
});

test('rejects malformed order identifiers as a bad request', async () => {
  const pipe = new ParseUUIDPipe({ version: '4' });
  await assert.rejects(
    pipe.transform('not-a-uuid', { type: 'param', metatype: String, data: 'id' }),
    BadRequestException,
  );
});
