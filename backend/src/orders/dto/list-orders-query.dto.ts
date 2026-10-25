import { BadRequestException } from '@nestjs/common';

export type OrderSort = 'newest' | 'oldest';

export class ListOrdersQueryDto {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly financialStatus?: string;
  readonly fulfillmentStatus?: string;
  readonly dateFrom?: Date;
  readonly dateTo?: Date;
  readonly sort: OrderSort;

  private constructor(values: {
    page: number;
    pageSize: number;
    search?: string;
    financialStatus?: string;
    fulfillmentStatus?: string;
    dateFrom?: Date;
    dateTo?: Date;
    sort: OrderSort;
  }) {
    Object.assign(this, values);
    this.page = values.page;
    this.pageSize = values.pageSize;
    this.sort = values.sort;
    this.search = values.search;
    this.financialStatus = values.financialStatus;
    this.fulfillmentStatus = values.fulfillmentStatus;
    this.dateFrom = values.dateFrom;
    this.dateTo = values.dateTo;
  }

  static fromQuery(query: Record<string, unknown>): ListOrdersQueryDto {
    const allowed = new Set([
      'page', 'pageSize', 'search', 'financialStatus', 'fulfillmentStatus', 'dateFrom', 'dateTo', 'sort',
    ]);
    for (const key of Object.keys(query)) {
      if (!allowed.has(key)) invalid(`Unknown query parameter: ${key}.`);
    }

    const page = parseInteger(query.page, 'page', 1, 1_000_000, 1);
    const pageSize = parseInteger(query.pageSize, 'pageSize', 1, 100, 20);
    if (!Number.isSafeInteger((page - 1) * pageSize)) invalid('Pagination values are out of range.');

    const search = parseOptionalText(query.search, 'search', 200);
    const financialStatus = parseOptionalText(query.financialStatus, 'financialStatus', 64);
    const fulfillmentStatus = parseOptionalText(query.fulfillmentStatus, 'fulfillmentStatus', 64);
    const dateFrom = parseDate(query.dateFrom, 'dateFrom', false);
    const dateTo = parseDate(query.dateTo, 'dateTo', true);
    if (dateFrom && dateTo && dateFrom > dateTo) invalid('dateFrom must be on or before dateTo.');

    const sortValue = parseOptionalText(query.sort, 'sort', 16) ?? 'newest';
    if (sortValue !== 'newest' && sortValue !== 'oldest') {
      invalid('sort must be either newest or oldest.');
    }

    return new ListOrdersQueryDto({
      page,
      pageSize,
      search,
      financialStatus,
      fulfillmentStatus,
      dateFrom,
      dateTo,
      sort: sortValue,
    });
  }
}

function parseInteger(value: unknown, name: string, min: number, max: number, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) invalid(`${name} must be an integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    invalid(`${name} must be between ${min} and ${max}.`);
  }
  return parsed;
}

function parseOptionalText(value: unknown, name: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') invalid(`${name} must be a single text value.`);
  const parsed = value.trim();
  if (!parsed) invalid(`${name} must not be empty.`);
  if (parsed.length > maxLength) invalid(`${name} must be at most ${maxLength} characters.`);
  return parsed;
}

function parseDate(value: unknown, name: string, endOfDay: boolean): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') invalid(`${name} must be a single ISO date or timestamp.`);

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  if (!dateOnly && (!value.includes('T') || !hasTimezone)) {
    invalid(`${name} must be an ISO date or timestamp with a timezone.`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || (dateOnly && parsed.toISOString().slice(0, 10) !== value)) {
    invalid(`${name} must be a valid date.`);
  }
  if (dateOnly && endOfDay) parsed.setUTCHours(23, 59, 59, 999);
  return parsed;
}

function invalid(message: string): never {
  throw new BadRequestException({ code: 'VALIDATION_ERROR', message });
}
