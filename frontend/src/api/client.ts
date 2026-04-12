import { getToken } from '../auth';

const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? '';

/** API client with auth header injection and structured error handling. */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init?.headers as Record<string, string>) || {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (res.status === 204) return undefined as unknown as T;

  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: 'unknown', message: res.statusText }));
    throw error;
  }

  return res.json();
}
