import { getToken, clearToken } from '../auth';
import { tryRefreshToken } from '../auth/refresh';

const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? '';

/** API client with auth header injection, 401 auto-refresh, and structured error handling. */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetchWithAuth(path, init);

  // 401 → attempt token refresh, then retry once
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const retry = await fetchWithAuth(path, init);
      if (retry.status === 401) {
        // Refresh succeeded but still 401 — force re-login
        forceLogout();
        throw { error: 'session_expired', message: 'Session expired. Please log in again.' };
      }
      if (retry.status === 204) return undefined as unknown as T;
      if (!retry.ok) {
        const error = await retry.json().catch(() => ({ error: 'unknown', message: retry.statusText }));
        throw error;
      }
      return retry.json();
    }
    // No refresh token available — force re-login
    forceLogout();
    throw { error: 'session_expired', message: 'Session expired. Please log in again.' };
  }

  if (res.status === 204) return undefined as unknown as T;

  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: 'unknown', message: res.statusText }));
    throw error;
  }

  return res.json();
}

async function fetchWithAuth(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init?.headers as Record<string, string>) || {}),
  };
  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

function forceLogout() {
  clearToken();
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}
