import { createContext } from 'react';
import type { UserDto, LoginResult } from '../bridge/ipc';

export interface AuthContextType {
  currentUser: UserDto | null;
  isLoading: boolean;
  login: (username: string, secret: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  hasPermission: (permKey: string) => boolean;
  refreshUser: () => Promise<void>;
  isRoot: boolean;
  isAdmin: boolean;
  /** True only for the shop owner account (server-provided flag). */
  isOwner: boolean;
  /** Owner or root: may run owner-level operations (restore, license, factory reset, recovery code). */
  isOwnerOrRoot: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
