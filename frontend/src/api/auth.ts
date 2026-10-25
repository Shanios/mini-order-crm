import { fetchJson } from './client';
import type { AuthSession, LoginCredentials } from './types';

export async function fetchSession(): Promise<AuthSession> {
  return fetchJson<AuthSession>('/api/auth/session');
}

export async function login(credentials: LoginCredentials): Promise<AuthSession> {
  return fetchJson<AuthSession>('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  });
}

export async function logout(csrfToken: string): Promise<{ authenticated: boolean }> {
  return fetchJson<{ authenticated: boolean }>('/api/auth/logout', {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrfToken,
    },
  });
}
