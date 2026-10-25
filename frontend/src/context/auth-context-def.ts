import { createContext } from 'react';
import type { AuthSession, LoginCredentials } from '../api/types';

export interface AuthContextType {
  user: { username: string } | null;
  csrfToken: string | null;
  expiresAt: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<AuthSession>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
