import type { ApiErrorResponse } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let errorData: ApiErrorResponse | null = null;
    try {
      errorData = (await response.json()) as ApiErrorResponse;
    } catch {
      // response was not JSON
    }

    let message: string;
    let code: string | undefined = errorData?.code;
    let details: unknown = errorData?.details;

    if (errorData?.error && typeof errorData.error === 'object') {
      message = errorData.error.message || `Request failed with status ${response.status}`;
      code = errorData.error.code || code;
      details = errorData.error.details || details;
    } else if (typeof errorData?.error === 'string') {
      message = errorData.error;
    } else if (errorData?.message) {
      message = errorData.message;
    } else {
      message = `Request failed with status ${response.status} (${response.statusText})`;
    }

    throw new ApiError(response.status, message, code, details);
  }

  return (await response.json()) as T;
}
