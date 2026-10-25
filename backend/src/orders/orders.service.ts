import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListOrdersQueryDto) {
    const where: Prisma.OrderWhereInput = {};
    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { customerName: { contains: query.search, mode: 'insensitive' } },
        { customerEmail: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.financialStatus) where.financialStatus = query.financialStatus;
    if (query.fulfillmentStatus) where.fulfillmentStatus = query.fulfillmentStatus;
    if (query.dateFrom || query.dateTo) {
      where.orderDate = {
        ...(query.dateFrom ? { gte: query.dateFrom } : {}),
        ...(query.dateTo ? { lte: query.dateTo } : {}),
      };
    }

    try {
      const [orders, total] = await Promise.all([
        this.prisma.order.findMany({
          where,
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          orderBy: [
            { orderDate: query.sort === 'oldest' ? 'asc' : 'desc' },
            { id: 'asc' },
          ],
          include: {
            customer: true,
            _count: { select: { items: true } },
          },
        }),
        this.prisma.order.count({ where }),
      ]);

      return {
        data: orders,
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      };
    } catch (error) {
      throwDatabaseFailure(error);
    }
  }

  async findById(id: string) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id },
        include: {
          customer: true,
          items: { orderBy: { id: 'asc' } },
        },
      });
      if (!order) {
        throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found.' });
      }
      return { data: order };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throwDatabaseFailure(error);
    }
  }
}

function throwDatabaseFailure(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError
    || error instanceof Prisma.PrismaClientUnknownRequestError
    || error instanceof Prisma.PrismaClientInitializationError
    || error instanceof Prisma.PrismaClientRustPanicError) {
    throw new ServiceUnavailableException({
      code: 'DATABASE_UNAVAILABLE',
      message: 'The database request could not be completed.',
    });
  }
  throw error;
}
