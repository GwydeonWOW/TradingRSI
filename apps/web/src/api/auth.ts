import { apiGet, apiPost, apiPut } from './client.ts';

export interface AuthUser {
  id: string;
  role: string;
  mfaEnabled: boolean;
  mfaRequired: boolean;
  createdAt: string;
}

export interface PendingUser {
  id: string;
  role: string;
  mfaEnabled: boolean;
  email: string | null;
  createdAt: string;
}

export const authApi = {
  needsSetup: () => apiGet<{ success: true; data: { needsSetup: boolean } }>('/auth/needs-setup'),
  register: (data: { email: string; password: string }) =>
    apiPost<{ success: true; data: { id: string; role: string; token: string } }>('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    apiPost<{ success: true; data: { id?: string; role?: string; mfaEnabled?: boolean; requiresMfa?: boolean; token: string } }>('/auth/login', data),
  me: () => apiGet<{ success: true; data: AuthUser }>('/auth/me'),
  setup2fa: () => apiPost<{ success: true; data: { uri: string; qr: string; secret: string } }>('/auth/2fa/setup'),
  verify2fa: (data: { code: string }) =>
    apiPost<{ success: true; data: { enabled: boolean; recoveryCodes: string[]; token: string } }>('/auth/2fa/verify', data),
  challenge2fa: (data: { code: string }) =>
    apiPost<{ success: true; data: { verified: boolean; token: string } }>('/auth/2fa/challenge', data),
  listUsers: () => apiGet<{ success: true; data: PendingUser[] }>('/auth/users'),
  approveUser: (id: string, data?: { role?: string }) => apiPost<{ success: true; data: { id: string; role: string } }>(`/auth/users/${id}/approve`, data),
  createUser: (data: { email: string; password: string; role?: string }) =>
    apiPost<{ success: true; data: { id: string; role: string } }>('/auth/users', data),
  updateUserRole: (id: string, data: { role: string }) =>
    apiPut<{ success: true; data: { id: string; role: string } }>(`/auth/users/${id}/role`, data),
  seedAdmin: () => apiPost<{ success: true; data: { message: string } }>('/auth/seed-admin'),
};
