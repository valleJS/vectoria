import type { AdminAction, AdminState, ApiError, JoinResponse, LobbyInfo } from '@vectoria/shared';

const BASE = import.meta.env.VITE_API_URL ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = (await res.json().catch(() => ({ error: res.statusText }))) as T | ApiError;
  if (!res.ok) throw new Error((body as ApiError).error || res.statusText);
  return body as T;
}

export const api = {
  lobby: () => request<LobbyInfo>('/api/lobby'),
  join: (name: string) =>
    request<JoinResponse>('/api/join', { method: 'POST', body: JSON.stringify({ name }) }),
  adminState: (token: string) =>
    request<AdminState>('/api/admin/state', { headers: { authorization: `Bearer ${token}` } }),
  adminAction: (token: string, action: AdminAction) =>
    request<AdminState>('/api/admin/action', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(action),
    }),
};
