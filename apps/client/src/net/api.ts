import type {
  AdminAction,
  AdminState,
  OutpostLevelPreview,
  ApiError,
  AuthStartRequest,
  AuthStartResponse,
  AuthVerifyRequest,
  AuthVerifyResponse,
  LobbyInfo,
  MapData,
} from '@vectoria/shared';

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
  authStart: (body: AuthStartRequest) =>
    request<AuthStartResponse>('/api/auth/start', { method: 'POST', body: JSON.stringify(body) }),
  authVerify: (body: AuthVerifyRequest) =>
    request<AuthVerifyResponse>('/api/auth/verify', { method: 'POST', body: JSON.stringify(body) }),
  adminState: (token: string) =>
    request<AdminState>('/api/admin/state', { headers: { authorization: `Bearer ${token}` } }),
  /** The map's tiles; null before the game starts. */
  adminMap: (token: string) =>
    request<MapData | null>('/api/admin/map', { headers: { authorization: `Bearer ${token}` } }),
  /** Outpost levels replayed from the server's save backups (preview; apply via adminAction). */
  adminOutpostLevels: (token: string) =>
    request<OutpostLevelPreview>('/api/admin/outpost-levels', {
      headers: { authorization: `Bearer ${token}` },
    }),
  adminAction: (token: string, action: AdminAction) =>
    request<AdminState>('/api/admin/action', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(action),
    }),
};

/** Server redirect to the source of the running code (AGPL-3.0 §13). */
export const SOURCE_HREF = `${BASE}/source`;
