import type { AdminRole } from '@iphoneha/shared';

export interface AuthUser {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
}

export interface AuthAdmin {
  id: string;
  phone: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      authAdmin?: AuthAdmin;
      authSessionId?: string;
    }
  }
}
