import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShopStatusService {
  constructor(private readonly prisma: PrismaService) {}

  async listConnections() {
    try {
      const shops = await this.prisma.shopConnection.findMany({
        select: {
          id: true,
          shopDomain: true,
          lastSyncedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      return {
        data: {
          configured: shops.length > 0,
          shops,
        },
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError
        || error instanceof Prisma.PrismaClientUnknownRequestError
        || error instanceof Prisma.PrismaClientInitializationError
        || error instanceof Prisma.PrismaClientRustPanicError) {
        throw new ServiceUnavailableException({
          code: 'DATABASE_UNAVAILABLE',
          message: 'Shop connection status could not be retrieved.',
        });
      }
      throw error;
    }
  }
}
