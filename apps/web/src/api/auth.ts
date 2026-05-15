import { apiGet, apiPost } from './client.ts';

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
  createdAt: string;
}

export const authApi = {
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
  approveUser: (id: string) => apiPost<{ success: true; data: { id: string; role: string } }>(`/auth/users/${id}/approve`),
  seedAdmin: () => apiPost<{ success: true; data: { message: string } }>('/auth/seed-admin'),
};
